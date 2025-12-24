# Proofer Reconstruction - Implementation Notes

## Completed Components

1. ✅ **ProoferState.ts** - Added FaceStack, PlyStack, Composites types
2. ✅ **ResourceManager.ts** - CPU compositor with `buildComposites()` method
3. ✅ **CardGeometry.ts** - Multi-ply support with plyIndex attribute
4. ✅ **MaterialPipeline.ts** - Simplified per-face materials (no face detection)
5. ✅ **fragment.glsl** - Simplified shader using uPrintMap, uIsFront (no face detection)
6. ✅ **vertex.glsl** - Added plyIndex attribute
7. ✅ **ProoferController.ts** - Added `buildFaceStacks()` method

## Remaining Critical Changes

### ✅ EngineBridge.ts - COMPLETED

The EngineBridge has been updated to:

1. ✅ **Removed old texture composition logic** - Replaced with FaceStack architecture
2. ✅ **Added new orchestration method** - `updateFromFaceStacks()` uses ResourceManager.buildComposites()
3. ✅ **Manages materials per ply/face** - Stores materials in Map with key "ply{index}_{face}"
4. ✅ **Updates geometry** - Calls `cardGeometry.updateDimensions()` with plyCount

### ✅ ProoferUI.ts - COMPLETED

Updated to support multiple meshes per ply:

1. ✅ **Stores meshes per ply/face** - Uses `Map<string, THREE.Mesh>` with key "ply{index}_{face}"
2. ✅ **Creates meshes per ply/face** - Creates separate geometry per ply/face using `CardGeometry.createPlyFaceGeometry()`
3. ✅ **Updates meshes** - Recreates meshes when FaceStacks change or dimensions update
4. ✅ **Registers materials for lighting** - Each material is registered with EngineController

## Key Architectural Changes

### Before (Broken)
- Single material with face detection in shader
- Mirrored back UVs
- Only one plate per channel used
- Single texture shared for front/back

### After (Fixed)
- Separate materials per face (front/back) per ply
- No UV mirroring - back uses its own texture
- All plates composited in correct order
- CPU compositor positions textures using rectPx/startPx/endPx

## Testing Checklist

1. ✅ Case A (single ply): front and back show different prints
2. ✅ Case B (multi-ply): each ply shows correct textures
3. ✅ Multiple PRINT plates composite correctly (stack order)
4. ✅ Multiple mask plates composite correctly (max blend)
5. ✅ Front finishes only apply to front, back finishes to back
6. ✅ Textures positioned correctly using rectPx (not always top-left)
7. ✅ Debug modes work (showPrintOnly, showMaskOnly)

## Performance Notes

- Composites are cached by jobId + plyIndex + plate IDs
- Textures are reused across materials when possible
- Hot reload only recomposites affected channels

