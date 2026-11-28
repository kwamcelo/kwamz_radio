import Combine
import ExpoModulesCore
import MusicKit

/// Apple Music playback through MusicKit's ApplicationMusicPlayer. The app owns the
/// queue; the system provides background audio and lock-screen controls.
public class KwamzMusicKitModule: Module {
  private let player = ApplicationMusicPlayer.shared
  private var stateObserver: AnyCancellable?
  private var queueObserver: AnyCancellable?
  private var lastStatus: String?
  private var lastAppleId: String?

  public func definition() -> ModuleDefinition {
    Name("KwamzMusicKit")

    Events("onPlaybackStateChange", "onNowPlayingChange")

    OnStartObserving {
      self.observeState()
      self.observeQueue()
    }

    OnStopObserving {
      self.stateObserver = nil
      self.queueObserver = nil
    }

    Function("authorizationStatus") { () -> String in
      Self.describe(MusicAuthorization.currentStatus)
    }

    AsyncFunction("requestAuthorization") { () async -> String in
      Self.describe(await MusicAuthorization.request())
    }

    AsyncFunction("canPlayCatalogContent") { () async throws -> Bool in
      try await MusicSubscription.current.canPlayCatalogContent
    }

    /// Replaces the queue with these catalog songs, in order, and returns the ids that
    /// could actually be queued (songs missing from the user's storefront are dropped).
    AsyncFunction("setQueue") { (appleIds: [String], startIndex: Int) async throws -> [String] in
      let request = MusicCatalogResourceRequest<Song>(
        matching: \.id, memberOf: appleIds.map { MusicItemID($0) })
      let response = try await request.response()
      let byId = Dictionary(
        response.items.map { ($0.id.rawValue, $0) }, uniquingKeysWith: { first, _ in first })
      let songs = appleIds.compactMap { byId[$0] }
      guard !songs.isEmpty else { return [] }

      let wanted = appleIds.indices.contains(startIndex) ? appleIds[startIndex] : nil
      let start = songs.first { $0.id.rawValue == wanted } ?? songs[0]
      await MainActor.run {
        self.player.queue = ApplicationMusicPlayer.Queue(for: songs, startingAt: start)
        self.observeQueue()
      }
      try await self.player.prepareToPlay()
      return songs.map { $0.id.rawValue }
    }

    AsyncFunction("play") { () async throws in
      try await self.player.play()
    }

    AsyncFunction("pause") { () async in
      await MainActor.run { self.player.pause() }
    }

    AsyncFunction("skipToNext") { () async throws in
      try await self.player.skipToNextEntry()
    }

    AsyncFunction("skipToPrevious") { () async throws in
      try await self.player.skipToPreviousEntry()
    }

    AsyncFunction("seek") { (positionMs: Double) async in
      await MainActor.run { self.player.playbackTime = positionMs / 1000 }
    }

    Function("getPositionMs") { () -> Double in
      self.player.playbackTime * 1000
    }
  }

  // MARK: - events

  private func observeState() {
    stateObserver = player.state.objectWillChange.sink { [weak self] _ in
      // objectWillChange fires before the value changes: read it on the next run loop.
      DispatchQueue.main.async { self?.emitState() }
    }
    emitState()
  }

  private func observeQueue() {
    queueObserver = player.queue.objectWillChange.sink { [weak self] _ in
      DispatchQueue.main.async { self?.emitNowPlaying() }
    }
    emitNowPlaying()
  }

  private func emitState() {
    let status = Self.describe(player.state.playbackStatus)
    guard status != lastStatus else { return }
    lastStatus = status
    sendEvent("onPlaybackStateChange", ["status": status])
  }

  private func emitNowPlaying() {
    var appleId: String?
    if case .song(let song) = player.queue.currentEntry?.item {
      appleId = song.id.rawValue
    }
    guard appleId != lastAppleId else { return }
    lastAppleId = appleId
    sendEvent("onNowPlayingChange", ["appleId": appleId])
  }

  // MARK: - mapping

  private static func describe(_ status: MusicAuthorization.Status) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "notDetermined"
    }
  }

  private static func describe(_ status: MusicKit.MusicPlayer.PlaybackStatus) -> String {
    switch status {
    case .playing, .seekingForward, .seekingBackward: return "playing"
    case .paused, .interrupted: return "paused"
    case .stopped: return "stopped"
    @unknown default: return "stopped"
    }
  }
}
