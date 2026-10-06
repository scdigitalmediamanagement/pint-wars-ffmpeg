import Foundation
import ffmpegkit

final class MemoriesJob {
  let id: String
  let directory: URL
  var holds = 0
  var released = false
  var cancelled = false
  var sessionId: Int?
  var output: URL?

  init(id: String, directory: URL) {
    self.id = id
    self.directory = directory
  }
}

// Every consumer pins its job, including AVPlayer and the native share sheet.
// A React unmount therefore cannot delete a file still in use by iOS.
final class MemoriesJobStore {
  static let shared = MemoriesJobStore()
  static let root = FileManager.default.temporaryDirectory
    .appendingPathComponent("pint-war-memories", isDirectory: true)
  private let lock = NSLock()
  private var jobs: [String: MemoriesJob] = [:]

  func begin() throws -> String {
    lock.lock()
    defer { lock.unlock() }
    let fm = FileManager.default
    try fm.createDirectory(at: Self.root, withIntermediateDirectories: true)
    // Recover temporary files left by a terminated process, never live jobs.
    let active = Set(jobs.keys)
    for url in (try? fm.contentsOfDirectory(at: Self.root, includingPropertiesForKeys: [.creationDateKey])) ?? [] {
      let created = try? url.resourceValues(forKeys: [.creationDateKey]).creationDate
      if !active.contains(url.lastPathComponent),
         let date = created, date < Date().addingTimeInterval(-86_400) {
        try? fm.removeItem(at: url)
      }
    }
    let id = UUID().uuidString
    let directory = Self.root.appendingPathComponent(id, isDirectory: true)
    try fm.createDirectory(at: directory, withIntermediateDirectories: false,
      attributes: [.protectionKey: FileProtectionType.complete])
    var excluded = URLResourceValues()
    excluded.isExcludedFromBackup = true
    var protectedDirectory = directory
    try protectedDirectory.setResourceValues(excluded)
    jobs[id] = MemoriesJob(id: id, directory: directory)
    return id
  }

  func acquire(_ id: String) throws -> MemoriesJob {
    lock.lock()
    defer { lock.unlock() }
    guard let job = jobs[id], !job.released, !job.cancelled else {
      throw failure("Generation was cancelled. Try creating Memories again.")
    }
    job.holds += 1
    return job
  }

  func acquirePlayer(_ uri: String) throws -> MemoriesJob {
    lock.lock()
    defer { lock.unlock() }
    guard let job = jobs.values.first(where: { !$0.released && $0.output?.absoluteString == uri }) else {
      throw failure("The local Memories video is no longer available.")
    }
    job.holds += 1
    return job
  }

  func finish(_ job: MemoriesJob) {
    lock.lock()
    job.holds -= 1
    let remove = job.released && job.holds == 0
    if remove { jobs.removeValue(forKey: job.id) }
    lock.unlock()
    if remove { try? FileManager.default.removeItem(at: job.directory) }
  }

  func release(_ id: String) {
    lock.lock()
    guard let job = jobs[id] else { lock.unlock(); return }
    job.released = true
    job.cancelled = true
    let sessionId = job.sessionId
    let remove = job.holds == 0
    if remove { jobs.removeValue(forKey: id) }
    lock.unlock()
    if let sessionId { FFmpegKit.cancel(sessionId) }
    if remove { try? FileManager.default.removeItem(at: job.directory) }
  }

  func check(_ job: MemoriesJob) throws {
    lock.lock()
    let cancelled = job.cancelled
    lock.unlock()
    if cancelled { throw failure("Generation was cancelled.") }
  }

  func session(_ id: Int?, job: MemoriesJob) {
    lock.lock()
    job.sessionId = id
    let cancelled = job.cancelled
    lock.unlock()
    // Handles cancellation between executeAsync() and recording its session.
    if cancelled, let id { FFmpegKit.cancel(id) }
  }

  func publish(_ url: URL, job: MemoriesJob) throws {
    lock.lock()
    defer { lock.unlock() }
    guard !job.cancelled else { throw failure("Generation was cancelled.") }
    job.output = url
  }

  func output(_ job: MemoriesJob) throws -> URL {
    lock.lock()
    let url = job.output
    lock.unlock()
    guard let url, FileManager.default.fileExists(atPath: url.path) else {
      throw failure("Create the Memories video before saving or sharing.")
    }
    return url
  }

  func imageURL(_ uri: String, job: MemoriesJob) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL,
      url.standardizedFileURL.deletingLastPathComponent() == job.directory.standardizedFileURL,
      url.lastPathComponent.hasPrefix("photo-"), url.pathExtension == "jpg",
      FileManager.default.fileExists(atPath: url.path) else {
      throw failure("A selected photo is not a local file in this Memories job.")
    }
    return url
  }

  func releaseAll() {
    lock.lock()
    let ids = Array(jobs.keys)
    lock.unlock()
    ids.forEach(release)
  }
}

func failure(_ message: String) -> NSError {
  NSError(domain: "PintWarsMemories", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}
