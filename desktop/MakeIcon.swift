import AppKit
let destination = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let p = CGFloat(pixels)
        NSColor(calibratedRed: 0.15, green: 0.38, blue: 0.32, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: p*0.06, y: p*0.06, width: p*0.88, height: p*0.88), xRadius: p*0.19, yRadius: p*0.19).fill()
        NSColor(calibratedRed: 0.98, green: 0.96, blue: 0.89, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: p*0.26, y: p*0.2, width: p*0.5, height: p*0.63), xRadius: p*0.045, yRadius: p*0.045).fill()
        NSColor(calibratedRed: 0.9, green: 0.58, blue: 0.26, alpha: 1).setStroke()
        let check = NSBezierPath()
        check.lineWidth = p*0.065
        check.lineCapStyle = .round
        check.lineJoinStyle = .round
        check.move(to: NSPoint(x: p*0.36, y: p*0.47))
        check.line(to: NSPoint(x: p*0.46, y: p*0.37))
        check.line(to: NSPoint(x: p*0.65, y: p*0.61))
        check.stroke()
        NSGraphicsContext.restoreGraphicsState()
        let suffix = scale == 2 ? "@2x" : ""
        try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
    }
}
