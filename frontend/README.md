# Silkcards Configurator - Phase 1

3D Card Configurator & Print-Accurate Proofer - Phase 1: Core 3D Engine Foundation

## Overview

Phase 1 implements the core 3D engine foundation with:
- Procedural card geometry generation
- Dynamic UV mapping
- Modular shader pipeline for print layers
- HDR environment rendering
- Test harness for development

## Project Structure

```
src/
  engine/
    EngineController.ts    # Renderer, scene, camera, lighting
    CardGeometry.ts        # Procedural card mesh generator
    MaterialPipeline.ts    # Shader material system
  shaders/
    baseMaterial.glsl      # Base vertex shader
    layerBlend.glsl        # Blending utilities
    foilLayerMock.glsl     # Foil layer placeholder
    uvLayerMock.glsl       # UV layer placeholder
    embossLayerMock.glsl   # Emboss layer placeholder
  resources/
    ResourceManager.ts     # Asset loader (HDR, textures, masks)
  test/
    TestHarness.ts         # Dev controls (HTML + keyboard)
  main.ts                  # Application entry point
public/
  hdr/                     # HDR environment maps
  textures/                # Artwork textures
  masks/                   # Print layer masks
backend/
  src/                     # Express.js template (Phase 1: no implementation)
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Open browser to `http://localhost:3000`

## Features

### Card Geometry
- Dynamic dimensions (width, height, thickness, corner radius)
- Rounded corners with configurable segments
- Proper UV mapping for print accuracy
- Stable topology for future emboss displacement

### Shader Pipeline
- Modular GLSL architecture
- Placeholder layers: Foil, UV Gloss, Emboss
- Mask-driven blending
- Layer toggles and intensity controls

### Test Harness
- HTML sliders for dimension control
- Keyboard shortcuts:
  - Arrow keys: Adjust dimensions
  - 1-3: Toggle layers (Foil, UV, Emboss)
  - R: Reload shaders

## Default Values

- Card: 85mm × 55mm (credit card size)
- Thickness: 0.3mm
- Corner Radius: 3mm

## Resources

Place HDR environments, artwork textures, and masks in:
- `public/hdr/` - HDR environment maps
- `public/textures/` - Artwork textures
- `public/masks/` - Foil/UV/Emboss masks

If resources are missing, placeholder textures will be generated automatically.

## Backend

The `backend/` directory contains an Express.js TypeScript template. No implementation in Phase 1.

## Next Phases

Phase 1 provides the foundation for:
- Phase 2: Configurator UI
- Phase 3: Final shader quality
- Phase 4: Print proofer export
- Phase 5: API integration

## Development Notes

- All shader modules are combined at runtime in `MaterialPipeline`
- Geometry is rebuilt on dimension changes (not just scaled)
- UVs are recalculated to maintain print accuracy
- Test harness is dev-only (no UI framework)

