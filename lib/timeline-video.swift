import Foundation
import AVFoundation
import CoreGraphics
import CoreVideo
func invalid(_ message:String)->NSError {NSError(domain:"MyTwin",code:1,userInfo:[NSLocalizedDescriptionKey:message])}
func time(_ value:Double)->CMTime {CMTime(seconds:value,preferredTimescale:48000)}
Task {
 do {
  let request=try JSONSerialization.jsonObject(with:Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[1]))) as! [String:Any]
  let duration=request["duration"] as! Double
  let sizes:[String:CGSize] = ["16:9":CGSize(width:1920,height:1080),"9:16":CGSize(width:1080,height:1920),"1:1":CGSize(width:1080,height:1080),"4:3":CGSize(width:1440,height:1080)]
  let size=sizes[request["ratio"] as? String ?? "16:9"]!
  let composition=AVMutableComposition()
  let mix=AVURLAsset(url:URL(fileURLWithPath:request["audio"] as! String))
  guard let sourceAudio=try await mix.loadTracks(withMediaType:.audio).first else {throw invalid("The timeline audio could not be read.")}
  let audio=composition.addMutableTrack(withMediaType:.audio,preferredTrackID:kCMPersistentTrackID_Invalid)!
  try audio.insertTimeRange(CMTimeRange(start:.zero,duration:time(duration)),of:sourceAudio,at:.zero)
  // A continuous black source keeps leading/trailing gaps decodable in the MP4.
  let backgroundURL=URL(fileURLWithPath:request["output"] as! String).deletingLastPathComponent().appendingPathComponent("background.mp4")
  let writer=try AVAssetWriter(outputURL:backgroundURL,fileType:.mp4)
  let input=AVAssetWriterInput(mediaType:.video,outputSettings:[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:32,AVVideoHeightKey:32])
  let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:32,kCVPixelBufferHeightKey as String:32])
  writer.add(input)
  guard writer.startWriting() else {throw writer.error ?? invalid("Could not prepare video background.")}
  writer.startSession(atSourceTime:.zero)
  for stamp in [0.0,duration] {
   while !input.isReadyForMoreMediaData {if writer.status == .failed {throw writer.error!};try await Task.sleep(nanoseconds:10_000_000)}
   var pixel:CVPixelBuffer?
   guard let pool=adaptor.pixelBufferPool,CVPixelBufferPoolCreatePixelBuffer(nil,pool,&pixel)==kCVReturnSuccess,let pixel=pixel else {throw invalid("Could not prepare video frame.")}
   CVPixelBufferLockBaseAddress(pixel,[]);memset(CVPixelBufferGetBaseAddress(pixel),0,CVPixelBufferGetDataSize(pixel));CVPixelBufferUnlockBaseAddress(pixel,[])
   guard adaptor.append(pixel,withPresentationTime:time(stamp)) else {throw writer.error ?? invalid("Could not write video background.")}
  }
  input.markAsFinished();await writer.finishWriting()
  guard writer.status == .completed else {throw writer.error ?? invalid("Could not finish video background.")}
  let backgroundAsset=AVURLAsset(url:backgroundURL)
  let backgroundSource=try await backgroundAsset.loadTracks(withMediaType:.video).first!
  let background=composition.addMutableTrack(withMediaType:.video,preferredTrackID:kCMPersistentTrackID_Invalid)!
  try background.insertTimeRange(CMTimeRange(start:.zero,duration:time(duration)),of:backgroundSource,at:.zero)
  let backgroundLayer=AVMutableVideoCompositionLayerInstruction(assetTrack:background)
  backgroundLayer.setTransform(CGAffineTransform(scaleX:size.width/32,y:size.height/32),at:.zero)
  var instructions:[AVMutableVideoCompositionInstruction]=[]
  var cursor=0.0
  func black(_ start:Double,_ end:Double) {
   if end<=start {return}
   let instruction=AVMutableVideoCompositionInstruction();instruction.timeRange=CMTimeRange(start:time(start),duration:time(end-start));instruction.backgroundColor=CGColor(gray:0,alpha:1);instruction.layerInstructions=[backgroundLayer];instructions.append(instruction)
  }
  for clip in request["clips"] as! [[String:Any]] {
   let start=clip["start"] as! Double,length=clip["duration"] as! Double,offset=clip["sourceStart"] as! Double
   black(cursor,start)
   let asset=AVURLAsset(url:URL(fileURLWithPath:clip["path"] as! String))
   guard let source=try await asset.loadTracks(withMediaType:.video).first else {throw invalid("A selected video has no readable video track. Try H.264 MP4 or MOV.")}
   let sourceRange=try await source.load(.timeRange)
   let frame=1.0/30.0,end=CMTimeRangeGetEnd(sourceRange).seconds
   let sourceStart=max(sourceRange.start.seconds,min(offset,max(sourceRange.start.seconds,end-frame)))
   let available=min(length,end-sourceStart)
   guard available>0 else {throw invalid("A selected video is empty.")}
   let track=composition.addMutableTrack(withMediaType:.video,preferredTrackID:kCMPersistentTrackID_Invalid)!
   try track.insertTimeRange(CMTimeRange(start:time(sourceStart),duration:time(available)),of:source,at:time(start))
   // Hold the final frame when generated footage is shorter than its narration.
   if available<length {
    let tail=min(frame,available)
    track.removeTimeRange(CMTimeRange(start:time(start+available-tail),duration:time(tail)))
    try track.insertTimeRange(CMTimeRange(start:time(sourceStart+available-tail),duration:time(tail)),of:source,at:time(start+available-tail))
    track.scaleTimeRange(CMTimeRange(start:time(start+available-tail),duration:time(tail)),toDuration:time(length-available+tail))
   }
   let natural=try await source.load(.naturalSize),preferred=try await source.load(.preferredTransform)
   let bounds=CGRect(origin:.zero,size:natural).applying(preferred)
   let sx=size.width/abs(bounds.width),sy=size.height/abs(bounds.height)
   let scale=request["fit"] as? String == "cover" ? max(sx,sy) : min(sx,sy)
   let transform=preferred.concatenating(CGAffineTransform(translationX:-bounds.minX,y:-bounds.minY)).concatenating(CGAffineTransform(scaleX:scale,y:scale)).concatenating(CGAffineTransform(translationX:(size.width-abs(bounds.width)*scale)/2,y:(size.height-abs(bounds.height)*scale)/2))
   let layer=AVMutableVideoCompositionLayerInstruction(assetTrack:track);layer.setTransform(transform,at:time(start))
   let instruction=AVMutableVideoCompositionInstruction();instruction.timeRange=CMTimeRange(start:time(start),duration:time(length));instruction.backgroundColor=CGColor(gray:0,alpha:1);instruction.layerInstructions=[layer,backgroundLayer];instructions.append(instruction)
   cursor=start+length
  }
  black(cursor,duration)
  let video=AVMutableVideoComposition();video.renderSize=size;video.frameDuration=CMTime(value:1,timescale:30);video.instructions=instructions
  guard let exporter=AVAssetExportSession(asset:composition,presetName:AVAssetExportPresetHighestQuality) else {throw invalid("Video export is unavailable.")}
  exporter.videoComposition=video;exporter.outputURL=URL(fileURLWithPath:request["output"] as! String);exporter.outputFileType = .mp4;exporter.shouldOptimizeForNetworkUse=true;exporter.timeRange=CMTimeRange(start:.zero,duration:time(duration))
  await exporter.export()
  guard exporter.status == .completed else {throw exporter.error ?? invalid("Video export failed.")}
  print("{\"duration\":\(duration)}");exit(0)
 } catch {fputs("\(error)\n",stderr);exit(1)}
}
dispatchMain()
