precision highp float;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

uniform sampler2D uPrintMap;
uniform sampler2D uFoilMask;
uniform sampler2D uUvMask;
uniform sampler2D uEmbossMask;
uniform sampler2D uDiecutMask;

uniform float uIsFront; // 1.0 front, 0.0 back
uniform vec3 uBaseColor;

uniform bool foilEnabled;
uniform bool uvEnabled;
uniform float uUvBoost;
uniform float uUvSpecPower;

uniform bool embossEnabled;
uniform float embossStrength;
uniform float embossMode;
uniform float uEmbossSpecBoost;
uniform float uEmbossSpecPower;

uniform bool dieCutEnabled;

uniform bool showFaceId;
uniform bool showPrintOnly;
uniform bool showFoilOnly;
uniform bool showMaskOnly;

uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uBackLightDirection;
uniform vec3 uBackLightColor;
uniform vec3 uAmbientColor;
uniform vec3 uCameraPosition;

float maskSample(vec4 t) {
  return max(t.a, max(t.r, max(t.g, t.b)));
}

// Smooth a (often binary) emboss mask into a rounded bevel profile.
// 3x3 Gaussian-ish blur: center*4 + cross*2 + diag*1 ( /16 )
float embossHeightFiltered(vec2 uv, vec2 t) {
  float c  = maskSample(texture2D(uEmbossMask, uv));
  float l  = maskSample(texture2D(uEmbossMask, uv - vec2(t.x, 0.0)));
  float r  = maskSample(texture2D(uEmbossMask, uv + vec2(t.x, 0.0)));
  float d  = maskSample(texture2D(uEmbossMask, uv - vec2(0.0, t.y)));
  float u  = maskSample(texture2D(uEmbossMask, uv + vec2(0.0, t.y)));

  float ul = maskSample(texture2D(uEmbossMask, uv + vec2(-t.x,  t.y)));
  float ur = maskSample(texture2D(uEmbossMask, uv + vec2( t.x,  t.y)));
  float dl = maskSample(texture2D(uEmbossMask, uv + vec2(-t.x, -t.y)));
  float dr = maskSample(texture2D(uEmbossMask, uv + vec2( t.x, -t.y)));

  return (4.0 * c + 2.0 * (l + r + u + d) + (ul + ur + dl + dr)) * (1.0 / 16.0);
}

void main() {
  bool isFront = (uIsFront > 0.5);
  vec2 uv = vUv;

  if (showFaceId) {
    gl_FragColor = isFront ? vec4(1.0,0.0,0.0,1.0) : vec4(0.0,0.0,1.0,1.0);
    return;
  }

  // Diecut discard (usually OFF because EngineBridge disables it for extruded holes)
  if (dieCutEnabled) {
    float cutVal = maskSample(texture2D(uDiecutMask, uv));
    // If your mask convention is inverted, flip this comparison.
    if (cutVal < 0.5) discard;
  }

  vec4 printColor = texture2D(uPrintMap, uv);
  vec3 baseColor = printColor.rgb * uBaseColor;

  // WORLD-space lighting vectors
  vec3 N0 = normalize(vWorldNormal);
  vec3 N = N0;

  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);

  vec3 frontL = normalize(-uLightDirection);
  vec3 backL  = normalize(-uBackLightDirection);

  vec3 keyL = isFront ? frontL : backL;
  vec3 keyC = isFront ? uLightColor : uBackLightColor;

  // Emboss (rounded bevel from smoothed height)
  float embossHeight = 0.0;
  vec2  embossGrad   = vec2(0.0);
  float embossEdge   = 0.0;
  float embossAmp    = 0.0;

  if (embossEnabled) {
  // If your masks are not 2048, change this constant to match export size
  // (best is to pass a uniform texel size, but keep this for now).
  vec2 baseTexel = vec2(1.0 / 2048.0);

  // Slightly larger radius => softer, rounder highlight
  vec2 t = baseTexel * 1.5;

  // Smoothed height (bevel profile)
  float hC = embossHeightFiltered(uv, t);

  // Keep height stable + rounded transition
  embossHeight = smoothstep(0.0, 1.0, hC);

  // Central differences on smoothed height (less “angled” than forward diff)
  float hL = embossHeightFiltered(uv - vec2(t.x, 0.0), t);
  float hR = embossHeightFiltered(uv + vec2(t.x, 0.0), t);
  float hD = embossHeightFiltered(uv - vec2(0.0, t.y), t);
  float hU = embossHeightFiltered(uv + vec2(0.0, t.y), t);

  float dHx = (hR - hL) * 0.5 * embossMode;
  float dHy = (hU - hD) * 0.5 * embossMode;
  embossGrad = vec2(dHx, dHy);

  // Keep slopes gentle (your older *32 makes faceting obvious)
  embossAmp = embossStrength * 4.0;

  // Build perturbed normal; keep Z strong so it looks rounded instead of “chamfered”
  float z = 1.0;
  vec3 bump = normalize(vec3(-dHx * embossAmp, -dHy * embossAmp, (isFront ? z : -z)));

  // Don’t fully replace the base normal; preserves “paper” behavior
  float bumpMix = clamp(embossStrength, 0.0, 0.85);
  N = normalize(mix(N0, bump, bumpMix));

  // Edge factor for highlight control (soft rolloff)
  embossEdge = smoothstep(0.04, 0.28, length(embossGrad) * embossAmp);
}

  // Base diffuse/spec (key light per face)
  float NdotL = max(dot(N, keyL), 0.0);
  vec3 diffuse = keyC * NdotL;

  vec3 ambient = uAmbientColor;
  vec3 extraSpec = vec3(0.0);

    if (embossEnabled && embossHeight > 0.01) {
      vec3 H = normalize(keyL + viewDir);
      float NdotH = max(dot(N, H), 0.0);

      // Wider = softer highlight
      float p = max(6.0, uEmbossSpecPower * 0.25);

      float embossSpec = pow(NdotH, p) * embossEdge;
      embossSpec *= embossHeight * embossStrength * uEmbossSpecBoost;

      extraSpec += keyC * embossSpec;
      ambient += vec3(embossHeight * embossStrength * 0.20);
    }

  vec3 lit = baseColor * (ambient + diffuse) + extraSpec;

  if (showPrintOnly) { gl_FragColor = vec4(lit, printColor.a); return; }
  if (showFoilOnly)  { float m = maskSample(texture2D(uFoilMask, uv)); gl_FragColor = vec4(vec3(m),1.0); return; }
  if (showMaskOnly) {
    float f = maskSample(texture2D(uFoilMask, uv));
    float u = maskSample(texture2D(uUvMask, uv));
    float e = maskSample(texture2D(uEmbossMask, uv));
    gl_FragColor = vec4(f,u,e,1.0);
    return;
  }

    // Foil (wider + punchier; reacts from more angles)
  if (foilEnabled) {
    vec4 foilTex = texture2D(uFoilMask, uv);

    // Prefer alpha as coverage (avoids "ghost foil" from garbage RGB in fully transparent pixels)
    float m = foilTex.a;
    if (m <= 0.001) {
      m = max(foilTex.r, max(foilTex.g, foilTex.b));
    }

    if (m > 0.01) {
      // make mid alpha read stronger (common in exported masks)
      float strength = pow(clamp(m, 0.0, 1.0), 0.75);

      // Use the mask's RGB as foil tint (supports multiple foil colors in one combined mask).
      // Un-premultiply if the loader/exporter stored premultiplied RGB.
      vec3 rawColor = foilTex.rgb;
      if (foilTex.a > 0.001) {
        rawColor = rawColor / max(foilTex.a, 1e-4);
      }

      // If exporter left RGB black but alpha present, fall back to gold.
      float rawMax = max(rawColor.r, max(rawColor.g, rawColor.b));
      vec3 foilColor = (rawMax < 0.02) ? vec3(0.9, 0.75, 0.4) : clamp(rawColor, 0.0, 1.0);

      // Approx sRGB -> linear (your foil masks are authored as "colors", not linear data)
      foilColor = pow(foilColor, vec3(2.2));

      float NdotV = max(dot(N, viewDir), 0.0);

      // Schlick Fresnel with high F0 (metal)
      float F0 = 0.35;
      float F  = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

      // Two-lobe spec: broad base + tight sparkle
      float widePow  = 6.0;
      float sharpPow = 80.0;

      // Front light
      float NdotLf = max(dot(N, frontL), 0.0);
      vec3  Hf     = normalize(frontL + viewDir);
      float NdotHf = max(dot(N, Hf), 0.0);
      float specF  =
        (pow(NdotHf, widePow)  * 1.0 +
         pow(NdotHf, sharpPow) * 0.35) * mix(0.25, 1.0, NdotLf);

      // Back light (boost so backside doesn't read dull)
      float NdotLb = max(dot(N, backL), 0.0);
      vec3  Hb     = normalize(backL + viewDir);
      float NdotHb = max(dot(N, Hb), 0.0);
      float specB  =
        (pow(NdotHb, widePow)  * 1.0 +
         pow(NdotHb, sharpPow) * 0.35) * mix(0.25, 1.0, NdotLb) * 1.5;

      vec3 spec = uLightColor * specF + uBackLightColor * specB;

      // Stronger, wider foil reflection
      vec3 metallic = foilColor * (0.20 + 0.80 * F) + spec * 4.0;

      // Foil should "take over" more than paper
      vec3 foilOut = mix(foilColor, metallic, 0.35 + 0.65 * F);

      lit = mix(lit, foilOut, strength);
    }
  }

  // Spot UV gloss (wider + less angle-picky)
if (uvEnabled) {
  float m = maskSample(texture2D(uUvMask, uv));
  if (m > 0.01) {
    float strength = smoothstep(0.0, 1.0, m) * uUvBoost;

    vec3 H = normalize(keyL + viewDir);
    float NdotH = max(dot(N, H), 0.0);

    // widen the lobe without requiring TS changes
    float widePow  = max(3.0, uUvSpecPower * 0.18);
    float tightPow = max(8.0, uUvSpecPower * 0.65);

    float specWide  = pow(NdotH, widePow);
    float specTight = pow(NdotH, tightPow);

    float NdotV = max(dot(N, viewDir), 0.0);

    // Clearcoat-ish fresnel (noticeable but not metallic)
    float F0 = 0.06;
    float F  = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

    float NdotL2 = max(dot(N, keyL), 0.0);
    float lightVis = mix(0.35, 1.0, NdotL2); // don't hard-kill at angles

    float specTerm = (specWide * 1.0 + specTight * 0.25);

    lit += keyC * specTerm * lightVis * strength * 1.35;
    lit += keyC * F * strength * 0.85;
  }
}

  gl_FragColor = vec4(lit, printColor.a);
}
