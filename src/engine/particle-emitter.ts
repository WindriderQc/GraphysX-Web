import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type ColorRepresentation,
  Points,
  PointsMaterial,
  Scene,
  Vector3
} from "three";

type Particle = {
  age: number;
  life: number;
  position: Vector3;
  velocity: Vector3;
  color: Color;
};

export class ParticleEmitter {
  readonly points: Points;
  private readonly particles: Particle[] = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: BufferGeometry;
  private readonly maxParticles: number;

  constructor(scene: Scene, maxParticles = 300) {
    this.maxParticles = maxParticles;
    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new BufferAttribute(this.colors, 3));

    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const context = glowCanvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.2, "rgba(255,255,255,0.95)");
      gradient.addColorStop(0.55, "rgba(255,255,255,0.38)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 64, 64);
    }
    const glowTexture = new CanvasTexture(glowCanvas);

    this.points = new Points(
      this.geometry,
      new PointsMaterial({
        map: glowTexture,
        vertexColors: true,
        size: 0.38,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.96,
        alphaTest: 0.02,
        depthWrite: false,
        blending: AdditiveBlending
      })
    );

    scene.add(this.points);
  }

  get activeCount(): number {
    return this.particles.length;
  }

  clear(): void {
    this.particles.length = 0;
    this.geometry.setDrawRange(0, 0);
  }

  burst(origin: Vector3, count: number, speed = 4, life = 0.7, color: ColorRepresentation = "#ffe86b"): void {
    const baseColor = new Color(color);
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift();
      }

      const direction = new Vector3(
        Math.random() - 0.5,
        Math.random() * 0.9 + 0.25,
        Math.random() - 0.5
      ).normalize();

      this.particles.push({
        age: 0,
        life,
        position: origin.clone(),
        velocity: direction.multiplyScalar(speed * (0.45 + Math.random() * 0.75)),
        color: baseColor.clone().offsetHSL((Math.random() - 0.5) * 0.035, 0, (Math.random() - 0.5) * 0.12)
      });
    }
  }

  update(deltaSeconds: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.age += deltaSeconds;
      particle.velocity.y -= 6 * deltaSeconds;
      particle.position.addScaledVector(particle.velocity, deltaSeconds);

      if (particle.age >= particle.life) {
        this.particles.splice(i, 1);
      }
    }

    this.positions.fill(0);
    this.colors.fill(0);
    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i];
      const offset = i * 3;
      this.positions[offset] = particle.position.x;
      this.positions[offset + 1] = particle.position.y;
      this.positions[offset + 2] = particle.position.z;
      this.colors[offset] = particle.color.r;
      this.colors[offset + 1] = particle.color.g;
      this.colors[offset + 2] = particle.color.b;
    }

    this.geometry.setDrawRange(0, this.particles.length);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
