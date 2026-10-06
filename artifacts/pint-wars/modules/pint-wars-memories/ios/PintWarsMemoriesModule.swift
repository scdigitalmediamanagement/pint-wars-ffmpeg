import ExpoModulesCore
import Photos
import UIKit

public final class PintWarsMemoriesModule: Module {
  private let renderingQueue = DispatchQueue(label: "com.pintwars.memories.render", qos: .userInitiated)
  private let store = MemoriesJobStore.shared

  public func definition() -> ModuleDefinition {
    Name("PintWarsMemories")
    Events("onProgress")

    AsyncFunction("beginJobAsync") { () throws -> String in try self.store.begin() }
      .runOnQueue(renderingQueue)

    AsyncFunction("stagePhotoAsync") { (id: String, base64: String, player: String, pub: String) throws -> String in
      let job = try self.store.acquire(id)
      defer { self.store.finish(job) }
      return try MemoriesRenderer.stage(base64, player: player, pub: pub, job: job)
    }.runOnQueue(renderingQueue)

    AsyncFunction("createMemoriesVideoAsync") { (id: String, paths: [String], metadata: MemoriesMetadata) throws -> [String: Any] in
      let job = try self.store.acquire(id)
      defer { self.store.finish(job) }
      return try MemoriesRenderer.render(job: job, imagePaths: paths, metadata: metadata) { progress in
        self.sendEvent("onProgress", ["jobId": id, "progress": progress])
      }
    }.runOnQueue(renderingQueue)

    Function("releaseJob") { (id: String) in self.store.release(id) }
    OnDestroy { self.store.releaseAll() }

    AsyncFunction("saveVideoAsync") { (id: String, promise: Promise) in
      do {
        let job = try self.store.acquire(id)
        let url: URL
        do { url = try self.store.output(job) }
        catch { self.store.finish(job); throw error }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
          guard status == .authorized else {
            self.store.finish(job)
            promise.reject("PHOTOS_PERMISSION_DENIED", "Allow Pint Wars to add videos in iPhone Settings to save this film.")
            return
          }
          PHPhotoLibrary.shared().performChanges({
            PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
          }) { saved, _ in
            self.store.finish(job)
            if saved { promise.resolve("saved") }
            else { promise.reject("SAVE_FAILED", "The video could not be saved to Photos. Check available storage and try again.") }
          }
        }
      } catch { promise.reject("VIDEO_UNAVAILABLE", "Create the Memories video before saving.") }
    }.runOnQueue(.main)

    AsyncFunction("shareVideoAsync") { (id: String, promise: Promise) in
      do {
        let job = try self.store.acquire(id)
        let url: URL
        do { url = try self.store.output(job) }
        catch { self.store.finish(job); throw error }
        guard let controller = self.appContext?.utilities?.currentViewController(),
          controller.view.window != nil, controller.presentedViewController == nil else {
          self.store.finish(job)
          promise.reject("SHARE_FAILED", "The share sheet could not open. Close any other sheet and try again.")
          return
        }
        // A local MP4 file, never a proof-photo URL or a public Storage URL.
        let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        activity.popoverPresentationController?.sourceView = controller.view
        activity.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX,
          y: controller.view.bounds.midY, width: 1, height: 1)
        activity.completionWithItemsHandler = { _, completed, _, error in
          self.store.finish(job)
          if error != nil { promise.reject("SHARE_FAILED", "The MP4 could not be shared. Try again.") }
          else { promise.resolve(["completed": completed]) }
        }
        controller.present(activity, animated: true)
      } catch { promise.reject("VIDEO_UNAVAILABLE", "Create the Memories video before sharing.") }
    }.runOnQueue(.main)

    View(MemoriesPlayerView.self) {
      Events("onStatus")
      Prop("uri") { (view: MemoriesPlayerView, uri: String) in view.setURI(uri) }
      Prop("playing") { (view: MemoriesPlayerView, playing: Bool) in view.setPlaying(playing) }
      Prop("seek") { (view: MemoriesPlayerView, seek: MemoriesSeek) in view.seek(seek) }
    }
  }
}
