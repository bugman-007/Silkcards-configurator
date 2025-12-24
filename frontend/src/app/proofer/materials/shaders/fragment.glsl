precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vFaceType; // 0.0 = front, 1.0 = back, 2.0 = edge

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

// Edge color (for card edges)
uniform vec3 uEdgeColor;

// Finish toggles (boolean flags)
uniform bool foilEnabled;
uniform bool uvEnabled;
uniform bool embossEnabled;
uniform float embossStrength;
uniform float embossMode; // +1.0 for emboss (raised), -1.0 for deboss (indented)
uniform bool dieCutEnabled;

// Debug flags (dev-only)
uniform bool showFaceId;
uniform bool showPrintOnly;
uniform bool showFoilOnly;
uniform bool showMaskOnly;

// Lighting uniforms
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform vec3 uCameraPosition;

void main() {
    bool isEdge = vFaceType > 1.5;
    bool isFront = uIsFront > 0.5; // Material is face-specific, no geometry detection needed

    // Debug: Show face ID
    if (showFaceId) {
        if (isFront) {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // RED = front
        } else if (isEdge) {
            gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); // GREEN = edge
        } else {
            gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0); // BLUE = back
        }
        return;
    }

    // Use UVs directly (no mirroring - geometry provides correct orientation)
    vec2 rotatedUv = vUv;
    
    // --- Die-cut discard ---
    // Must execute before any color accumulation
    if (dieCutEnabled && !isEdge) {
        vec4 dieCutTex = texture2D(uDiecutMask, rotatedUv);
        float cutVal = dieCutTex.r;
        
        // White (1.0) = hole -> discard fragment
        if (cutVal > 0.5) {
            discard;
        }
    }
    
    // Sample base print texture
    vec4 printColor = texture2D(uPrintMap, rotatedUv);
    
    // Edge faces use edge color
    if (isEdge) {
        gl_FragColor = vec4(uEdgeColor, 1.0);
        return;
    }

    // Apply base color tint
    vec3 baseColor = printColor.rgb * uBaseColor;

    // ===================================================
    // Emboss / Deboss Height Map → Normal Perturbation
    // ===================================================
    vec3 N = normalize(vNormal);
    vec3 N0 = N;
    float embossHeight = 0.0;
    
    // Apply emboss/deboss normal perturbation
    if (embossEnabled && !isEdge) {
        vec4 embossTex = texture2D(uEmbossMask, rotatedUv);
        float h = embossTex.r;
        embossHeight = h;
        
        // Texel size for normal calculation
        vec2 texel = vec2(1.0 / 1024.0, 1.0 / 1024.0);
        
        vec4 embossTexR = texture2D(uEmbossMask, rotatedUv + vec2(texel.x, 0.0));
        vec4 embossTexU = texture2D(uEmbossMask, rotatedUv + vec2(0.0, texel.y));
        float hR = embossTexR.r;
        float hU = embossTexU.r;
        
        float dHx = (hR - h) * embossMode;
        float dHy = (hU - h) * embossMode;
        
        // Bump normal (tangent space approximation)
        vec3 bumpNormal = normalize(vec3(-dHx, -dHy, 1.0));
        
        // Mix base normal with bump normal
        N = normalize(mix(N0, bumpNormal, embossStrength * 20.0));
    }
    
    // Calculate lighting with perturbed normal (or original if no emboss)
    vec3 lightDir = normalize(-uLightDirection);
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    
    // Diffuse lighting
    float NdotL = max(dot(N, lightDir), 0.0);
    vec3 diffuse = uLightColor * NdotL;
    
    // Ambient lighting
    vec3 ambient = uAmbientColor;
    float embossAmbientBoost = 0.0;
    
    // Add emboss enhancement for visibility
    if (embossEnabled && !isEdge && embossHeight > 0.01) {
        float heightFactor = (embossHeight - 0.5) * embossMode;
        float heightShading = heightFactor * embossStrength * 1.2;
        
        float viewDotN = max(dot(viewDir, N), 0.0);
        float rimFactor = pow(1.0 - viewDotN, 1.5) * embossHeight * embossStrength * 0.6;
        
        embossAmbientBoost = embossHeight * embossStrength * 0.3;
        
        ambient += vec3(embossAmbientBoost);
        diffuse += vec3(heightShading + rimFactor);
    }
    
    // Combine base lighting
    vec3 litColor = baseColor * (ambient + diffuse);

    // Debug: Show print only
    if (showPrintOnly) {
        gl_FragColor = vec4(litColor, printColor.a);
        return;
    }

    // Debug: Show foil mask only
    if (showFoilOnly) {
        float maskValue = texture2D(uFoilMask, rotatedUv).r;
        gl_FragColor = vec4(vec3(maskValue), 1.0);
        return;
    }

    // Debug: Show mask visualizations
    if (showMaskOnly) {
        vec4 foilTex = texture2D(uFoilMask, rotatedUv);
        vec4 uvTex = texture2D(uUvMask, rotatedUv);
        vec4 embossTex = texture2D(uEmbossMask, rotatedUv);
        
        // Color code: R=foil, G=uv, B=emboss
        gl_FragColor = vec4(foilTex.r, uvTex.r, embossTex.r, 1.0);
        return;
    }
    
    // Apply finish effects (only on front/back faces, not edges)
    if (!isEdge) {
        
        // Apply foil effect (mask-driven metallic BRDF)
        if (foilEnabled) {
            vec4 foilTex = texture2D(uFoilMask, rotatedUv);
            float foilMaskValue = foilTex.r;
            if (foilMaskValue > 0.5) {
                // Metallic foil color (gold)
                vec3 foilColor = vec3(0.9, 0.75, 0.4);
                
                // Metallic reflection - use reflection vector for specular with perturbed normal
                vec3 reflectDir = reflect(-lightDir, N);
                float specular = pow(max(dot(reflectDir, viewDir), 0.0), 32.0);
                
                // Blend foil with base color based on mask strength
                float foilStrength = smoothstep(0.5, 1.0, foilMaskValue);
                vec3 foilReflection = foilColor * (0.7 + 0.3 * specular);
                litColor = mix(litColor, foilReflection, foilStrength * 0.8);
            }
        }
        
        // Apply UV gloss effect (mask-driven clearcoat)
        if (uvEnabled) {
            vec4 uvTex = texture2D(uUvMask, rotatedUv);
            float uvMaskValue = uvTex.r;
            if (uvMaskValue > 0.01) {
                vec3 halfDir = normalize(lightDir + viewDir);
                
                // Clearcoat specular highlight with perturbed normal
                float clearcoatSpec = pow(max(dot(N, halfDir), 0.0), 32.0);
                
                // Fresnel term for edge highlights (view-dependent)
                float fresnel = pow(1.0 - max(dot(N, viewDir), 0.0), 2.0);
                
                // UV gloss effect strength from mask
                float uvStrength = smoothstep(0.0, 1.0, uvMaskValue);
                
                // Clearcoat specular contribution (additive)
                vec3 specularHighlight = vec3(clearcoatSpec * uvStrength * 0.35);
                
                // Fresnel edge highlight (additive)
                vec3 fresnelHighlight = vec3(fresnel * uvStrength * 0.2);
                
                // Add clearcoat brightness boost
                vec3 clearcoatBoost = vec3(uvStrength * 0.15);
                
                // Combine all UV gloss contributions (additive)
                litColor += specularHighlight + fresnelHighlight + clearcoatBoost;
                
                // Slight color tint for UV varnish (very subtle)
                vec3 uvTint = vec3(0.98, 0.99, 1.0);
                litColor = mix(litColor, litColor * uvTint, uvStrength * 0.1);
            }
        }
    }
    
    gl_FragColor = vec4(litColor, printColor.a);
}
