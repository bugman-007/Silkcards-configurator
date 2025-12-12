precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vFaceType;

// Base artwork
uniform sampler2D artworkMap;

// Base color tint (for stock preview)
uniform vec3 uBaseColor;

// Finish mask textures
uniform sampler2D foilMask;
uniform sampler2D uvMask;
uniform sampler2D embossMask;
uniform sampler2D dieCutMask;

// Finish toggles (boolean flags)
uniform bool foilEnabled;
uniform bool uvEnabled;
uniform bool embossEnabled;
uniform float embossStrength;
uniform float embossMode; // +1.0 for emboss (raised), -1.0 for deboss (indented)
uniform bool dieCutEnabled;

// Lighting uniforms
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform vec3 uCameraPosition;

void main() {
    // --- Die-cut discard ---
    // Must execute before any color accumulation
    if (dieCutEnabled) {
        // Flip UV horizontally: (1.0 - vUv.x, vUv.y)
        vec2 dieCutUv = vec2(1.0 - vUv.x, vUv.y);
        float cutVal = texture2D(dieCutMask, dieCutUv).r;
        
        // White (1.0) = hole → discard fragment
        if (cutVal > 0.5) {
            discard;
        }
    }
    
    // Sample base artwork
    vec4 artworkColor = texture2D(artworkMap, vUv);
    
    // Apply base color tint
    vec3 baseColor = artworkColor.rgb * uBaseColor;
    
    // ===================================================
    // Emboss / Deboss Height Map → Normal Perturbation
    // ===================================================
    // Start with base normal
    vec3 N = normalize(vNormal);
    vec3 N0 = N;
    float embossHeight = 0.0;
    
    // Apply emboss/deboss normal perturbation only on front face
    if (vFaceType == 0.0 && embossEnabled) {
        float h = texture2D(embossMask, vUv).r;
        embossHeight = h;
        
        // texel size — adjust according to your actual mask resolution
        vec2 texel = vec2(1.0 / 1024.0, 1.0 / 1024.0);
        
        float hR = texture2D(embossMask, vUv + vec2(texel.x, 0.0)).r;
        float hU = texture2D(embossMask, vUv + vec2(0.0, texel.y)).r;
        
        float dHx = (hR - h) * embossMode;
        float dHy = (hU - h) * embossMode;
        
        // bump normal (tangent space approximation)
        vec3 bumpNormal = normalize(vec3(-dHx, -dHy, 1.0));
        
        // mix base normal with bump normal (increased multiplier for stronger effect)
        N = normalize(mix(N0, bumpNormal, embossStrength * 20.0));
    }
    
    // Calculate lighting with perturbed normal (or original if no emboss)
    vec3 lightDir = normalize(-uLightDirection);
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    
    // Diffuse lighting
    float NdotL = max(dot(N, lightDir), 0.0);
    vec3 diffuse = uLightColor * NdotL;
    
    // Ambient lighting - increase for emboss areas to make them visible from all angles
    vec3 ambient = uAmbientColor;
    float embossAmbientBoost = 0.0;
    
    // Add emboss enhancement for visibility from all angles
    if (vFaceType == 0.0 && embossEnabled && embossHeight > 0.01) {
        // Height-based shading: raised areas get brighter, recessed areas darker
        // This creates depth perception independent of light direction
        float heightFactor = (embossHeight - 0.5) * embossMode; // -0.5 to +0.5 range
        float heightShading = heightFactor * embossStrength * 1.2; // Increased from 0.4 to 0.8
        
        // View-dependent rim lighting: highlight edges of embossed areas from any viewing angle
        float viewDotN = max(dot(viewDir, N), 0.0);
        float rimFactor = pow(1.0 - viewDotN, 1.5) * embossHeight * embossStrength * 0.6; // Increased from 0.3 to 0.6
        
        // Increase ambient for embossed areas to ensure visibility
        embossAmbientBoost = embossHeight * embossStrength * 0.3; // Increased from 0.15 to 0.3
        
        // Apply all enhancements
        ambient += vec3(embossAmbientBoost);
        diffuse += vec3(heightShading + rimFactor);
    }
    
    // Combine base lighting
    vec3 litColor = baseColor * (ambient + diffuse);
    
    // Apply finish effects only on the front face (vFaceType == 0.0)
    // vFaceType: 0.0 = front, 1.0 = back, 2.0 = edge
    // Edges (vFaceType == 2.0) should never receive finish effects
    // Back face (vFaceType == 1.0) can optionally receive effects in the future
    if (vFaceType == 0.0) {
        
        // Apply foil effect (mask-driven metallic BRDF)
        if (foilEnabled) {
            float foilMaskValue = texture2D(foilMask, vUv).r;
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
        
        // Apply UV gloss effect (mask-driven clearcoat) - uses perturbed normal
        if (uvEnabled) {
            float uvMaskValue = texture2D(uvMask, vUv).r;
            if (uvMaskValue > 0.01) {
                vec3 halfDir = normalize(lightDir + viewDir);
                
                // Clearcoat specular highlight with perturbed normal
                float clearcoatSpec = pow(max(dot(N, halfDir), 0.0), 32.0);
                
                // Fresnel term for edge highlights (view-dependent) with perturbed normal
                float fresnel = pow(1.0 - max(dot(N, viewDir), 0.0), 2.0);
                
                // UV gloss effect strength from mask
                float uvStrength = smoothstep(0.0, 1.0, uvMaskValue);
                
                // Clearcoat specular contribution (additive, not blending)
                vec3 specularHighlight = vec3(clearcoatSpec * uvStrength * 0.35);
                
                // Fresnel edge highlight (additive)
                vec3 fresnelHighlight = vec3(fresnel * uvStrength * 0.2);
                
                // Add clearcoat brightness boost (makes it shiny)
                vec3 clearcoatBoost = vec3(uvStrength * 0.15);
                
                // Combine all UV gloss contributions (additive)
                litColor += specularHighlight + fresnelHighlight + clearcoatBoost;
                
                // Slight color tint for UV varnish (very subtle)
                vec3 uvTint = vec3(0.98, 0.99, 1.0);
                litColor = mix(litColor, litColor * uvTint, uvStrength * 0.1);
            }
        }
    }
    
    gl_FragColor = vec4(litColor, 1.0);
}
