/**
 * Lighting Controller - Proofer
 * 
 * Manages lighting for Neutral Proof mode only.
 * Simple, consistent lighting for print-accurate proofer.
 */

import * as THREE from 'three';

/**
 * Lighting Controller
 * 
 * Manages directional and ambient lights with Neutral Proof configuration.
 */
export class LightingController {
  private scene: THREE.Scene;

  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;

  // NEW: back-side key light used by shader uniforms
  private backKeyLight!: THREE.DirectionalLight;

  private ambientLight!: THREE.AmbientLight;

  private readonly neutralProofConfig = {
    ambient: 0.65,
    key: 0.8,
    fill: 0.4,
    rim: 0.6,

    // NEW
    backKey: 0.8
  };
  /**
   * Constructor
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initializeLights();
  }

  /**
   * Initialize all lights with Neutral Proof configuration
   */
  private initializeLights(): void {
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.neutralProofConfig.ambient);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.key);
    this.keyLight.position.set(60, 70, 60);
    this.keyLight.target.position.set(0, 0, 0);
    this.scene.add(this.keyLight.target);
    this.scene.add(this.keyLight);

    // NEW: back key (mirrored Z)
    this.backKeyLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.backKey);
    this.backKeyLight.position.set(60, 70, -60);
    this.backKeyLight.target.position.set(0, 0, 0);
    this.scene.add(this.backKeyLight.target);
    this.scene.add(this.backKeyLight);

    this.fillLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.fill);
    this.fillLight.position.set(-40, 40, -30);
    this.fillLight.target.position.set(0, 0, 0);
    this.scene.add(this.fillLight.target);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.rim);
    this.rimLight.position.set(-50, 50, -70);
    this.rimLight.target.position.set(0, 0, 0);
    this.scene.add(this.rimLight.target);
    this.scene.add(this.rimLight);
  }

  /**
   * Get light references
   */
  getKeyLight(): THREE.DirectionalLight {
    return this.keyLight;
  }

  getBackKeyLight(): THREE.DirectionalLight {
    return this.backKeyLight;
  }

  getFillLight(): THREE.DirectionalLight {
    return this.fillLight;
  }

  getRimLight(): THREE.DirectionalLight {
    return this.rimLight;
  }

  getAmbientLight(): THREE.AmbientLight {
    return this.ambientLight;
  }

  /**
   * Dispose of lights
   */
  dispose(): void {
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
    }
    if (this.keyLight) {
      this.scene.remove(this.keyLight);
      this.scene.remove(this.keyLight.target);
      this.keyLight.dispose();
    }
    if (this.backKeyLight) {
      this.scene.remove(this.backKeyLight);
      this.scene.remove(this.backKeyLight.target);
      this.backKeyLight.dispose();
    }
    if (this.fillLight) {
      this.scene.remove(this.fillLight);
      this.scene.remove(this.fillLight.target);
      this.fillLight.dispose();
    }
    if (this.rimLight) {
      this.scene.remove(this.rimLight);
      this.scene.remove(this.rimLight.target);
      this.rimLight.dispose();
    }
  }
}
