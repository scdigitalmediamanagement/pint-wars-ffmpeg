Pod::Spec.new do |s|
  s.name = 'PintWarsMemories'
  s.version = '1.0.0'
  s.summary = 'Pint Wars local Memories export'
  s.description = 'An iOS-only Expo module using the pinned FFmpegKit Next device XCFrameworks.'
  s.license = { :type => 'Proprietary' }
  s.author = 'Pint Wars'
  s.homepage = 'https://github.com/arthenica/ffmpeg-kit-next'
  # Autolinking supplies the local :path; this is private pod metadata only.
  s.source = { :git => 'https://github.com/scdigitalmediamanagement/pint-wars-ffmpeg.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.0'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.vendored_frameworks = 'Frameworks/*.xcframework'
  s.preserve_paths = 'Notices/**/*'
  s.resources = 'Notices/**/*'
  s.resource_bundles = { 'PintWarsMemories_privacy' => ['PrivacyInfo.xcprivacy'] }
  s.frameworks = 'AVFoundation', 'Photos', 'UIKit', 'VideoToolbox', 'AudioToolbox', 'ImageIO'
  s.libraries = 'z', 'bz2', 'iconv', 'c++'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
