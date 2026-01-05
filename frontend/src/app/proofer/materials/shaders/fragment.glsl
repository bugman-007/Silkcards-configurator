precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;

// Print texture for this face (no face detection needed - material is face-specific)
uniform sampler2D uPrintMap;

// Finish mask textures (per-face)
uniform sampler2D uFoilMask;
uniform sampler2D uUvMask;
uniform sampler2D uEmbossMask;
uniform sampler2D uDiecutMask;

// Face identifier (0.0 = front, 1.0 = back) - set per material
uniform float uIsFront;

// Base color tint (for stock preview)
uniform vec3 uBaseColor;

// Finish toggles (boolean flags)
uniform bool foilEnabled;
uniform bool uvEnabled;
uniform float uUvBoost;      // overall UV intensity (1.0 default)
uniform float uUvSpecPower;  // spec sharpness (higher = tighter highlight)
uniform bool embossEnabled;
uniform float embossStrength;
uniform float embossMode; // +1.0 for emboss (raised), -1.0 for deboss (indented)
uniform float uEmbossSpecBoost; // extra highlight intensity for emboss
uniform float uEmbossSpecPower; // highlight sharpness (higher = tighter)
uniform bool dieCutEnabled;

// Debug flags (dev-only)
uniform bool showFaceId;
uniform bool showPrintOnly;
uniform bool showFoilOnly;
uniform bool showMaskOnly;

// Lighting uniforms
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uBackLightDirection;
uniform vec3 uBackLightColor;
uniform vec3 uAmbientColor;
uniform vec3 uCameraPosition;

// Mask sampling helper:
// Supports alpha-only masks (RGB=0, A=1) and RGB masks.
float maskSample(vec4 t) {
    return max(t.a, max(t.r, max(t.g, t.b)));
}

void main() {
    bool isFront = uIsFront > 0.5; // Material is face-specific, no geometry detection needed

    // Debug: Show face ID
    if (showFaceId) {
        if (isFront) {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // RED = front
        } else {
            gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0); // BLUE = back
        }
        return;
    }

    // Use UVs directly (no mirroring - geometry provides correct orientation)
    vec2 rotatedUv = vUv;
    
    // --- Die-cut discard ---
    // Must execute before any color accumulation
    if (dieCutEnabled) {
        vec4 dieCutTex = texture2D(uDiecutMask, rotatedUv);
        float cutVal = maskSample(dieCutTex);
        
        // White (1.0) = hole -> discard fragment
        if (cutVal > 0.5) {
            discard;
        }
    }
    
    // Sample base print texture
    vec4 printColor = texture2D(uPrintMap, rotatedUv);

    // Apply base color tint
    vec3 baseColor = printColor.rgb * uBaseColor;
    
    // ===================================================
    // Emboss / Deboss Height Map → Normal Perturbation
    // ===================================================
    vec3 N = normalize(vNormal);
    vec3 N0 = N;
    float embossHeight = 0.0;
    vec2 embossGrad = vec2(0.0); // stores local height gradient for additional shading/spec
    
    // Apply emboss/deboss normal perturbation
    if (embossEnabled) {
        vec4 embossTex = texture2D(uEmbossMask, rotatedUv);
        // Read mask from alpha or max of channels (tolerant to different mask formats)
        float h = maskSample(embossTex);
        embossHeight = h;
        
        // Use screen-space UV footprint instead of hardcoding 1/1024.
        // This keeps emboss readable at different texture sizes and zoom levels.
        vec2 texel = fwidth(rotatedUv) * 1.5;
        texel = max(texel, vec2(1.0 / 2048.0)); // safety floor

        float hR = maskSample(texture2D(uEmbossMask, rotatedUv + vec2(texel.x, 0.0)));
        float hU = maskSample(texture2D(uEmbossMask, rotatedUv + vec2(0.0, texel.y)));
        
        float dHx = (hR - h) * embossMode;
        float dHy = (hU - h) * embossMode;
        
        embossGrad = vec2(dHx, dHy);

        // Bump normal (tangent-ish approximation; good enough for flat card faces)
        vec3 bumpNormal = normalize(vec3(-dHx, -dHy, 1.0));
        
        // Much lower mix factor than *20 since gradients are now properly scaled
        float bumpMix = clamp(embossStrength * 6.0, 0.0, 1.0);
        N = normalize(mix(N0, bumpNormal, bumpMix));
    }
    
    // Calculate lighting with perturbed normal (or original if no emboss)
    //
    // IMPORTANT:
    // vNormal is in VIEW space (normalMatrix * normal in vertex.glsl).
    // With OrbitControls the CAMERA rotates, so we must also compute light/view directions in VIEW space.
    // Otherwise foil/UV spec won't react correctly (especially on the back side).
    vec3 lightDirWorld = normalize(-uLightDirection);
    vec3 backLightDirWorld = normalize(-uBackLightDirection);

    // Convert world-space light directions into view space
    vec3 lightDir = normalize(mat3(viewMatrix) * lightDirWorld);
    vec3 backLightDirVS = normalize(mat3(viewMatrix) * backLightDirWorld);

    // View direction in view space: camera is at origin, so viewDir = -viewPosition
    vec3 viewPos = (viewMatrix * vec4(vWorldPosition, 1.0)).xyz;
    vec3 viewDir = normalize(-viewPos);
    
    // Diffuse lighting
    float NdotL = max(dot(N, lightDir), 0.0);
    vec3 diffuse = uLightColor * NdotL;
    
    // Emboss reads via highlights; base shader has almost no spec, so add a controlled term.
    vec3 extraSpecular = vec3(0.0);
    
    // Ambient lighting
    vec3 ambient = uAmbientColor;
    float embossAmbientBoost = 0.0;
    
    // Add emboss enhancement for visibility
    if (embossEnabled && embossHeight > 0.01) {
        float heightFactor = (embossHeight - 0.5) * embossMode;
        float heightShading = heightFactor * embossStrength * 1.2;
        
        float viewDotN = max(dot(viewDir, N), 0.0);
        float rimFactor = pow(1.0 - viewDotN, 1.5) * embossHeight * embossStrength * 0.6;
        
        embossAmbientBoost = embossHeight * embossStrength * 0.3;
        
        ambient += vec3(embossAmbientBoost);
        diffuse += vec3(heightShading + rimFactor);
        
        // Tight highlight makes emboss/deboss actually read as depth
        vec3 halfDirE = normalize(lightDir + viewDir);
        float NdotH_E = max(dot(N, halfDirE), 0.0);

        // Grad helps emphasize edges without making the whole area look "puffy"
        float grad = clamp(length(embossGrad) * 4.0, 0.0, 1.0);

        float embossSpec = pow(NdotH_E, uEmbossSpecPower) * embossHeight * embossStrength * uEmbossSpecBoost;
        embossSpec *= mix(0.35, 1.0, grad);

        extraSpecular += uLightColor * embossSpec;
    }
    
    // Combine base lighting
    vec3 litColor = baseColor * (ambient + diffuse) + extraSpecular;

    // Debug: Show print only
    if (showPrintOnly) {
        gl_FragColor = vec4(litColor, printColor.a);
        return;
    }

    // Debug: Show foil mask only
    if (showFoilOnly) {
        float m = maskSample(texture2D(uFoilMask, rotatedUv));
        gl_FragColor = vec4(vec3(m), 1.0);
        return;
    }
    
    // Debug: Show mask visualizations
    if (showMaskOnly) {
        vec4 foilTex = texture2D(uFoilMask, rotatedUv);
        vec4 uvTex = texture2D(uUvMask, rotatedUv);
        vec4 embossTex = texture2D(uEmbossMask, rotatedUv);
        
        gl_FragColor = vec4(
            maskSample(foilTex),
            maskSample(uvTex),
            maskSample(embossTex),
            1.0
        );
        return;
    }
    
    // Apply finish effects (shader is used for caps only; sides/walls are separate materials)
    {
        // Apply foil effect (realistic metallic BRDF with Fresnel)
        if (foilEnabled) {
            vec4 foilTex = texture2D(uFoilMask, rotatedUv);
            float foilMaskValue = maskSample(foilTex);
            if (foilMaskValue > 0.01) {
                // Metallic foil color (gold) - can be adjusted for different foil types
                vec3 foilColor = vec3(0.9, 0.75, 0.4);
                
                // Foil strength from mask
                float foilStrength = smoothstep(0.0, 1.0, foilMaskValue);
                
                // Calculate view-dependent Fresnel for realistic metallic reflection
                float NdotV = max(dot(N, viewDir), 0.0);
                float fresnel = pow(1.0 - NdotV, 2.0); // Fresnel-Schlick approximation
                
                // Front light contribution
                vec3 frontLightDir = lightDir;
                vec3 frontHalfDir = normalize(frontLightDir + viewDir);
                float frontNdotH = max(dot(N, frontHalfDir), 0.0);
                float frontNdotL = max(dot(N, frontLightDir), 0.0);
                
                // Back light contribution (for viewing back side)
                vec3 backKeyLightDir = backLightDirVS;
                vec3 backHalfDir = normalize(backKeyLightDir + viewDir);
                float backNdotH = max(dot(N, backHalfDir), 0.0);
                float backNdotL = max(dot(N, backKeyLightDir), 0.0);
                
                // Metallic specular highlights (Cook-Torrance-like, simplified)
                float specularPower = 32.0; // was 64.0 (too tight, reads "dead" most angles)
                
                float frontSpec = pow(frontNdotH, specularPower) * frontNdotL;
                float backSpec  = pow(backNdotH,  specularPower) * backNdotL;
                
                // Combine both lights for realistic foil reflection
                vec3 specularHighlight = uLightColor * frontSpec + uBackLightColor * backSpec;
                
                // Metallic reflection: keep your structure, just boost spec a bit
                vec3 metallicReflection = foilColor * (0.4 + 0.6 * fresnel) + specularHighlight * 1.8;
                
                // Preserve foil color (opaque), let reflection modulate it
                vec3 foilResult = mix(foilColor, metallicReflection, fresnel * 0.8 + 0.2);
                
                // OPAQUE: foil replaces base color; only edges feather due to mask AA
                litColor = mix(litColor, foilResult, foilStrength);
            }
        }
        
        // Apply UV gloss effect (mask-driven clearcoat)
        if (uvEnabled) {
            vec4 uvTex = texture2D(uUvMask, rotatedUv);
            float uvMaskValue = maskSample(uvTex);

            if (uvMaskValue > 0.01) {
                // Mask strength
                float uvStrength = smoothstep(0.0, 1.0, uvMaskValue) * uUvBoost;

                vec3 halfDir = normalize(lightDir + viewDir);
                
                // Tighter, shinier clearcoat highlight
                float NdotH = max(dot(N, halfDir), 0.0);
                float clearcoatSpec = pow(NdotH, uUvSpecPower);

                // View-dependent edge sheen (wider fresnel for broader coverage)
                float NdotV = max(dot(N, viewDir), 0.0);
                float fresnel = pow(1.0 - NdotV, 2.0);
                
                // Scale by light visibility so it doesn't glow in shadow
                float NdotL2 = max(dot(N, lightDir), 0.0);
                
                // Additive only (keeps print colors clear beneath UV)
                vec3 specularHighlight = uLightColor * clearcoatSpec * NdotL2 * uvStrength * 0.85;
                vec3 fresnelHighlight  = uLightColor * fresnel * uvStrength * 0.35;
                
                litColor += specularHighlight + fresnelHighlight;
                
                // IMPORTANT: remove/avoid flat "brightness lift" that makes UV look milky/hazy.
                // (Your previous clearcoatBoost was the main reason UV looked unclear.)
            }
        }
    }
    
    gl_FragColor = vec4(litColor, printColor.a);
}