import AVFoundation
import ExpoModulesCore
import ImageIO
import UIKit
import ffmpegkit

struct MemoriesMetadata: Record {
  @Field var leagueName: String = ""
  @Field var completedLabel: String = ""
  @Field var winnerNames: String = ""
  @Field var winnerPoints: Int = 0
  @Field var winnerCount: Int = 0
  @Field var totalPints: Int = 0
  @Field var playerCount: Int = 0
  @Field var pubsVisited: Int = 0
}

enum MemoriesRenderer {
  static let size = CGSize(width: 720, height: 1280)
  static let navy = UIColor(red: 5/255, green: 8/255, blue: 13/255, alpha: 1)
  static let gold = UIColor(red: 1, green: 209/255, blue: 46/255, alpha: 1)
  static let ink = UIColor(white: 0.96, alpha: 1)

  static func stage(_ base64: String, player: String, pub: String, job: MemoriesJob) throws -> String {
    guard base64.utf8.count <= 28_000_000, let bytes = Data(base64Encoded: base64),
      let source = CGImageSourceCreateWithData(bytes as CFData, nil),
      let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceThumbnailMaxPixelSize: 1600,
        kCGImageSourceCreateThumbnailWithTransform: true
      ] as CFDictionary) else {
      throw failure("PHOTO_UNUSABLE")
    }
    let image = UIImage(cgImage: thumbnail)
    let composed = canvas { context in
      let scale = max(size.width / image.size.width, size.height / image.size.height)
      let rectangle = CGRect(x: (size.width - image.size.width * scale) / 2,
        y: (size.height - image.size.height * scale) / 2,
        width: image.size.width * scale, height: image.size.height * scale)
      image.draw(in: rectangle)
      let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [UIColor.clear.cgColor, navy.withAlphaComponent(0.98).cgColor] as CFArray,
        locations: [0, 1])!
      context.drawLinearGradient(gradient, start: CGPoint(x: 0, y: 550),
        end: CGPoint(x: 0, y: 1280), options: [])
      text("PINT WAR MEMORIES", y: 60, font: 20, color: gold)
      text(String(player.prefix(100)), y: 1040, font: 46, color: ink)
      if !pub.isEmpty { text(String(pub.prefix(140)), y: 1130, font: 24, color: ink) }
    }
    let url = job.directory.appendingPathComponent("photo-\(UUID().uuidString).jpg")
    try write(composed, url: url)
    try MemoriesJobStore.shared.check(job)
    return url.absoluteString
  }

  static func render(job: MemoriesJob, imagePaths: [String], metadata: MemoriesMetadata,
    progress: (Double) -> Void) throws -> [String: Any] {
    let store = MemoriesJobStore.shared
    guard !imagePaths.isEmpty, imagePaths.count <= 20, Set(imagePaths).count == imagePaths.count else {
      throw failure("Memories needs between 1 and 20 unique local photos.")
    }
    let images = try imagePaths.map { try store.imageURL($0, job: job) }
    let opening = job.directory.appendingPathComponent("opening.jpg")
    let closing = job.directory.appendingPathComponent("closing.jpg")
    try write(canvas { _ in
      text("PINT WAR MEMORIES", y: 390, font: 25, color: gold, centered: true)
      text(String(metadata.leagueName.prefix(140)), y: 480, font: 60, color: ink, centered: true)
      text(metadata.completedLabel, y: 720, font: 24, color: ink, centered: true)
      text("\(metadata.playerCount) PLAYERS · \(metadata.pubsVisited) PUBS", y: 820, font: 22, color: gold, centered: true)
    }, url: opening)
    try write(canvas { _ in
      text("THE FINAL WHISTLE", y: 310, font: 25, color: gold, centered: true)
      text(metadata.winnerCount == 0 ? "No score winner" : metadata.winnerCount > 1 ? "Tied winners" : "The winner",
        y: 405, font: 30, color: ink, centered: true)
      text(metadata.winnerCount == 0 ? metadata.leagueName : metadata.winnerNames,
        y: 490, font: 48, color: ink, centered: true)
      if metadata.winnerCount > 0 {
        text("\(metadata.winnerPoints) POINTS", y: 760, font: 54, color: gold, centered: true)
      }
      text("\(metadata.totalPints) PINTS · \(metadata.pubsVisited) PUBS · \(metadata.playerCount) PLAYERS",
        y: 915, font: 22, color: ink, centered: true)
      text("Made to be kept.", y: 1080, font: 26, color: gold, centered: true)
    }, url: closing)

    // Exactly 900 frames: 2s opening + 25s photographs + 3s real final results.
    // Serial segments bound memory use instead of decoding 20 images at once.
    let photoFrames = (0..<images.count).map { 750 / images.count + ($0 < 750 % images.count ? 1 : 0) }
    let inputs = [opening] + images + [closing]
    let frames = [60] + photoFrames + [90]
    var segments: [URL] = []
    defer {
      // Keep only the final MP4 and selected thumbnails for the live screen.
      // releaseJob removes those as well once player/save/share consumers finish.
      for url in segments + [opening, closing, job.directory.appendingPathComponent("concat.txt")] {
        try? FileManager.default.removeItem(at: url)
      }
    }
    for (index, input) in inputs.enumerated() {
      try store.check(job)
      let segment = job.directory.appendingPathComponent("segment-\(index).mp4")
      segments.append(segment)
      let duration = Double(frames[index]) / 30
      let fadeOut = String(format: "%.6f", locale: Locale(identifier: "en_US_POSIX"), duration - 0.18)
      try execute(["-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "30",
        "-i", input.path, "-vf", "fade=t=in:st=0:d=0.18:color=0x05080d,fade=t=out:st=\(fadeOut):d=0.18:color=0x05080d",
        "-frames:v", String(frames[index]), "-c:v", "h264_videotoolbox", "-b:v", "3500k",
        "-pix_fmt", "yuv420p", "-r", "30", "-g", "60", "-video_track_timescale", "90000",
        "-an", segment.path], job: job)
      progress(Double(index + 1) / Double(inputs.count + 1))
    }
    let list = job.directory.appendingPathComponent("concat.txt")
    // These filenames are generated internally, never supplied by a player.
    try segments.map { "file '\($0.lastPathComponent)'\n" }.joined().write(to: list, atomically: true, encoding: .utf8)
    let output = job.directory.appendingPathComponent("Pint-War-Memories.mp4")
    try execute(["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "1",
      "-i", list.path, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
      "-t", "30", "-movflags", "+faststart", output.path], job: job)
    try store.check(job)
    let asset = AVURLAsset(url: output)
    let duration = asset.duration.seconds
    guard asset.isPlayable, !asset.tracks(withMediaType: .video).isEmpty,
      duration.isFinite, abs(duration - 30) < 0.25 else {
      throw failure("The exported MP4 could not be verified. Try creating Memories again.")
    }
    try store.publish(output, job: job)
    progress(1)
    return ["uri": output.absoluteString, "duration": duration, "width": 720, "height": 1280]
  }

  private static func execute(_ arguments: [String], job: MemoriesJob) throws {
    let store = MemoriesJobStore.shared
    try store.check(job)
    let done = DispatchSemaphore(value: 0)
    let session = FFmpegKit.execute(withArgumentsAsync: arguments, withCompleteCallback: { _ in done.signal() })
    guard let session else { throw failure("The iOS video encoder could not start.") }
    store.session(session.getSessionId(), job: job)
    done.wait()
    store.session(nil, job: job)
    try store.check(job)
    guard ReturnCode.isSuccess(session.getReturnCode()) else {
      // Do not return FFmpeg logs: they contain local private-image paths.
      throw failure("The iOS video encoder failed. Keep Pint Wars open and try again.")
    }
  }

  private static func canvas(_ draw: (CGContext) -> Void) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
      navy.setFill()
      renderer.fill(CGRect(origin: .zero, size: size))
      draw(renderer.cgContext)
    }
  }

  private static func text(_ value: String, y: CGFloat, font: CGFloat, color: UIColor, centered: Bool = false) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = centered ? .center : .left
    paragraph.lineBreakMode = .byTruncatingTail
    let typeface = UIFont(name: "DMSans-Bold", size: font) ?? UIFont.systemFont(ofSize: font, weight: .bold)
    (String(value.prefix(300)) as NSString).draw(in: CGRect(x: 48, y: y, width: 624, height: font * 3.8),
      withAttributes: [.font: typeface, .foregroundColor: color, .paragraphStyle: paragraph])
  }

  private static func write(_ image: UIImage, url: URL) throws {
    guard let data = image.jpegData(compressionQuality: 0.9) else { throw failure("A Memories frame could not be prepared.") }
    try data.write(to: url, options: [.atomic, .completeFileProtection])
  }
}
