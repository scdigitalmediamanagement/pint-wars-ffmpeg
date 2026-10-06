import AVFoundation
import ExpoModulesCore

struct MemoriesSeek: Record {
  @Field var time: Double = 0
  @Field var id: Int = 0
}

final class MemoriesPlayerView: ExpoView {
  let onStatus = EventDispatcher()
  private let playerLayer = AVPlayerLayer()
  private var player: AVPlayer?
  private var observer: Any?
  private var statusObserver: NSKeyValueObservation?
  private var endObserver: NSObjectProtocol?
  private var job: MemoriesJob?
  private var uri = ""
  private var wantsPlayback = false
  private var lastSeek = -1

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    playerLayer.videoGravity = .resizeAspect
    layer.addSublayer(playerLayer)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    playerLayer.frame = bounds
  }

  func setURI(_ value: String) {
    guard value != uri else { return }
    clear()
    uri = value
    guard !value.isEmpty else { return }
    do {
      job = try MemoriesJobStore.shared.acquirePlayer(value)
      let item = AVPlayerItem(url: URL(string: value)!)
      let next = AVPlayer(playerItem: item)
      player = next
      playerLayer.player = next
      statusObserver = item.observe(\.status, options: [.new, .initial]) { [weak self] item, _ in
        DispatchQueue.main.async {
          guard let self else { return }
          if item.status == .failed {
            self.onStatus(["error": "This MP4 could not be played. Try creating the film again.", "playing": false])
          } else if item.status == .readyToPlay {
            self.setPlaying(self.wantsPlayback)
            self.emit()
          }
        }
      }
      observer = next.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.2, preferredTimescale: 600), queue: .main) {
        [weak self] _ in self?.emit()
      }
      endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime,
        object: item, queue: .main) { [weak self] _ in
        self?.wantsPlayback = false
        self?.emit()
      }
    } catch {
      onStatus(["error": "The local Memories video is no longer available.", "playing": false])
    }
  }

  func setPlaying(_ value: Bool) {
    wantsPlayback = value
    if value {
      if let player, let item = player.currentItem,
        item.duration.seconds.isFinite, player.currentTime().seconds >= item.duration.seconds - 0.1 {
        player.seek(to: .zero)
      }
      player?.play()
    } else { player?.pause() }
  }

  func seek(_ request: MemoriesSeek) {
    guard request.id != lastSeek else { return }
    lastSeek = request.id
    let duration = player?.currentItem?.duration.seconds ?? 30
    let bounded = max(0, min(request.time, duration.isFinite ? duration : 30))
    player?.seek(to: CMTime(seconds: bounded, preferredTimescale: 600),
      toleranceBefore: .zero, toleranceAfter: .zero)
  }

  private func emit() {
    guard let player else { return }
    let time = player.currentTime().seconds
    let duration = player.currentItem?.duration.seconds ?? 0
    onStatus(["time": time.isFinite ? time : 0, "duration": duration.isFinite ? duration : 0,
      "playing": wantsPlayback])
  }

  private func clear() {
    player?.pause()
    if let observer { player?.removeTimeObserver(observer) }
    if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    observer = nil
    endObserver = nil
    statusObserver = nil
    playerLayer.player = nil
    player = nil
    if let job { MemoriesJobStore.shared.finish(job) }
    job = nil
  }

  deinit {
    player?.pause()
    if let observer { player?.removeTimeObserver(observer) }
    if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    if let job { MemoriesJobStore.shared.finish(job) }
  }
}
