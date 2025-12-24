# Proofer Texture Debugging Guide

## What Was Fixed

### 1. ✅ Shader/Material Contract
- **Shader uses:** `uPrintMap`, `uFoilMask`, `uUvMask`, `uEmbossMask`, `uDiecutMask`
- **MaterialPipeline creates materials with:** `printMap`, `foilMask`, `uvMask`, `embossMask`, `diecutMask`
- **Contract:** Consistent — no `frontArtworkMap/backArtworkMap` confusion

### 2. ✅ URL Resolution
- **ResourceManager.getPlateImageUrl()** now:
  1. Prefers `plate.assets.png` / `plate.assets.maskPng` (already correct URLs)
  2. Falls back to `plate.file` and builds `/assets/<jobId>/out/<filename>` URL
  3. Logs every URL resolution with plate ID

### 3. ✅ Image Loading & Compositing
- **ResourceManager.loadImage()** loads images for CPU compositing
- **compositePrints()** / **compositeMasks()** composite multiple plates correctly
- Logs canvas size, plate counts, and draw operations
- Logs final texture sizes and UUIDs

### 4. ✅ Material Creation & Updates
- **EngineBridge.updateMaterialsForPly()** creates/updates materials with composited textures
- Logs when materials are created vs. updated
- Logs texture UUIDs being assigned to uniforms
- Sets `material.needsUpdate = true` and `texture.needsUpdate = true`

### 5. ✅ Mesh Binding
- **ProoferUI.updateMeshes()** creates meshes with correct materials
- Async retry mechanism for materials that aren't ready yet
- Logs when meshes are created/updated and which material they use

---

## How to Debug

### Step 1: Check Browser Console

After uploading a file and parsing, look for these log messages:

#### 1. **FaceStacks Built**
```
[Proofer] Built FaceStacks for 1 plies
```
✅ If you see this, `ProoferController` successfully parsed plates into FaceStacks

#### 2. **Compositing Started**
```
[ResourceManager] buildComposites: jobId=<jobId>, plyIndex=0
[ResourceManager] Plate counts: front.prints=1, back.prints=1
[ResourceManager] Card size: 1800x2550px
```
✅ If you see this, compositing is starting with correct plate counts

#### 3. **URL Resolution**
```
[ResourceManager] Resolved URL for front_layer_0_print (from assets): http://...
```
✅ URLs should look like:
- `/assets/<jobId>/out/<filename>.png` (local dev)
- `/api/parser-proxy/assets/<jobId>/out/<filename>.png` (production)
- `https://...` (direct URLs)

❌ **BAD SIGNS:**
- No URL logged → plate has no `assets` or `file` field
- 404 errors → URL is wrong
- CORS errors → image blocked by browser

#### 4. **Image Loading & Drawing** (CRITICAL!)
```
[ResourceManager] Image loaded for front_layer_0_print: 1800x2550px
[ResourceManager] Drawing print plate front_layer_0_print: imgSize=1800x2550, rect=0,0 size=1800x2550
```
✅ Image loaded AND drawn to canvas

❌ **BAD SIGNS:**
- "FAILED to load/draw print plate" → image load failed (404/CORS/decode error)
- **"Image loaded" but NO "Drawing print plate"** → image loaded but rect calculation failed or drawing skipped
- **No "Image loaded" logs at all** → `loadImage()` failing silently or not being called

#### 5. **Composites Created**
```
[ResourceManager] Composited print texture: 1800x2550px, uuid=<uuid>
[ResourceManager] Composites built for ply0: frontPrint=1800x2550, backPrint=1800x2550
```
✅ Textures were created with correct sizes

❌ **BAD SIGNS:**
- Sizes are 0x0 or null → compositor failed
- No composites logged → buildComposites didn't run

#### 6. **Materials Created**
```
[EngineBridge] Creating NEW front material for ply0: hasPrint=true, printSize=1800x2550
[EngineBridge] Front material created, uniforms: uPrintMap=true, printMapUUID=<uuid>
```
✅ Material was created with correct textures

❌ **BAD SIGNS:**
- `hasPrint=false` → compositor returned null
- `uPrintMap=false` → uniform not set
- No material creation logged → FaceStacks missing or updateFromFaceStacks not called

#### 7. **Meshes Created**
```
[ProoferUI] Created front mesh for ply 0 with material, hasPrint=true
```
✅ Mesh was created and uses material with print texture

❌ **BAD SIGNS:**
- "Created placeholder front mesh (waiting for materials)" → materials not ready yet (should retry)
- No mesh creation logged → FaceStacks missing or updateMeshes not called

---

## Common Issues & Fixes

### Issue 1: "No composites built" / "Cannot update from FaceStacks: missing data"
**Cause:** `state.faceStacks` is empty or undefined
**Check:**
- Did `ProoferController.loadParserPayload()` run?
- Did it call `buildFaceStacks()`?
- Are there plates in `payload.plates`?

### Issue 2: "FAILED to load print plate" / 404 errors
**Cause:** URLs are wrong
**Check:**
- Look at the logged URL
- Test the URL directly in browser
- Check if parser service is running (http://localhost:8080)
- Check if `/api/parser-proxy` is working (production)

### Issue 3: "Composited print texture: WxHpx" but NO "Drawing print plate" logs
**Cause:** Images are loading but NOT being drawn to canvas (canvas is empty/transparent)
**Check:**
- Do you see "[ResourceManager] Image loaded for <plate-id>:" logs?
- Do you see "[ResourceManager] Drawing print plate <plate-id>:" logs?
- If you see "Image loaded" but NO "Drawing", the rect calculation or drawImage call is being skipped

**This is the MOST COMMON cause of "white card" - textures are created but canvases are empty!**

### Issue 4: "hasPrint=false" in material creation
**Cause:** Compositor returned `null` (no plates or all failed to load)
**Check:**
- Were URLs resolved? (Step 3)
- Did images load? (Step 4)
- Were images drawn to canvas? (Step 4)

### Issue 5: Meshes use placeholder materials forever ⚠️ **MOST COMMON ISSUE**
**Cause:** Materials are created **asynchronously** but `updateMeshes()` runs **synchronously** on state change
**Symptoms:**
- ✅ Materials ARE created (see Step 6 logs)
- ❌ NO `[ProoferUI] Created/Updated front mesh` logs after materials are ready
- Card stays white/gray even though materials exist

**Root Cause:**
- `EngineBridge.updateFromFaceStacks()` is **async** (takes time to load images)
- `ProoferUI.updateMeshes()` runs **synchronously** when state changes
- By the time materials are ready, no new state change occurs → meshes never update

**Fix Applied:**
- Added callback mechanism: `EngineBridge` notifies `ProoferUI` when materials are ready
- Look for: `[EngineBridge] Materials ready, notifying ProoferUI to update meshes`
- Then: `[ProoferUI] Materials ready callback triggered, updating meshes`
- Then: `[ProoferUI] Created/Updated front mesh for ply 0`

### Issue 6: Card visible but textures are white/gray
**Cause:** Textures are placeholder or uniform assignment failed
**Check:**
- Are materials created with `uPrintMap` set? (Step 6)
- Are meshes using the correct materials? (Step 7)
- Check shader debug flags: `window.__PROOFER_DEBUG__ = { showPrintOnly: true }`

---

## Manual Debug Commands

Open browser console and try:

```javascript
// Check proofer state
const state = window.__prooferController?.getState();
console.log('FaceStacks:', state?.faceStacks);
console.log('Parser Payload:', state?.parserPayload);

// Check materials
const bridge = window.__engineBridge;
const frontMat = bridge?.getMaterial(0, 'front');
console.log('Front Material:', frontMat);
console.log('uPrintMap:', frontMat?.uniforms.uPrintMap?.value);

// Enable debug mode
window.__PROOFER_DEBUG__ = { showPrintOnly: true };
// Refresh by re-uploading or toggling an option
```

---

## Expected Flow (Success Case)

1. User uploads file → `ProoferController.loadParserPayload()`
2. Controller parses plates → `buildFaceStacks()` → `state.faceStacks` populated
3. Controller notifies listeners → `EngineBridge.onStateChange()` → `updateFromFaceStacks()`
4. EngineBridge calls `ResourceManager.buildComposites()`
5. ResourceManager:
   - Resolves URLs for each plate
   - Loads images via `loadImage()`
   - Composites images onto canvas
   - Creates THREE.Texture from canvas
   - Returns `Composites` object
6. EngineBridge calls `updateMaterialsForPly()`
   - Creates new material with `MaterialPipeline.createCardMaterial()`
   - Assigns composited textures to uniforms
   - Stores in `this.materials` Map
7. Controller notifies listeners again → `ProoferUI.updateMeshes()`
8. ProoferUI:
   - Gets materials from `EngineBridge.getMaterial()`
   - Creates meshes with correct materials
   - Adds meshes to scene
9. Render loop → shader samples `uPrintMap` → textures visible!

---

## If Textures Still Don't Show

1. **Check all console logs** — find where the flow breaks
2. **Test URLs manually** — paste logged URLs into browser address bar
3. **Check network tab** — are images loading? (200 status)
4. **Check WebGL errors** — any shader compilation errors?
5. **Try debug mode** — `window.__PROOFER_DEBUG__ = { showPrintOnly: true }`
6. **Verify parser output** — open `meta.json` and check `plates` array

---

## Contact Points for Each Step

| Step | File | Function | What to Check |
|------|------|----------|---------------|
| Parse payload | ProoferController.ts | `loadParserPayload()` | `state.faceStacks` populated |
| Build composites | ResourceManager.ts | `buildComposites()` | Textures created (not null) |
| Create materials | EngineBridge.ts | `updateMaterialsForPly()` | Materials have `uPrintMap` set |
| Create meshes | ProoferUI.ts | `updateMeshes()` | Meshes use correct materials |
| Render | fragment.glsl | `main()` | Shader samples `uPrintMap` |

