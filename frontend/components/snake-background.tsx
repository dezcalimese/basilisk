"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

export function SnakeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) {
      console.error("WebGL not supported");
      return;
    }

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Fragment shader with 3D raised scale pattern
    const fragmentShaderSource = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform vec3 primaryColor;
      uniform vec3 secondaryColor;
      uniform float isDark;

      // Noise function
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      // Voronoi for scale cells
      vec3 voronoi(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);

        float minDist1 = 10.0;
        float minDist2 = 10.0;
        vec2 minPoint = vec2(0.0);

        for(int y = -1; y <= 1; y++) {
          for(int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = i + neighbor;

            // Hexagonal offset pattern
            float offset = mod(point.y, 2.0) * 0.5;
            vec2 cellPos = vec2(
              hash(point) + offset,
              hash(point + vec2(13.7, 27.3))
            );

            // Subtle animation
            cellPos += 0.05 * sin(time * 0.2 + hash(point) * 6.28);

            vec2 diff = neighbor + cellPos - f;
            float dist = length(diff);

            if(dist < minDist1) {
              minDist2 = minDist1;
              minDist1 = dist;
              minPoint = point;
            } else if(dist < minDist2) {
              minDist2 = dist;
            }
          }
        }

        return vec3(minDist1, minDist2, hash(minPoint));
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        // Scale pattern to create many small scales (adjust for size)
        vec2 p = uv * 15.0;

        // Get voronoi distances
        vec3 vor = voronoi(p);
        float dist1 = vor.x;
        float dist2 = vor.y;
        float cellId = vor.z;

        // Create raised scale shape with sharp edges
        float scale = smoothstep(0.45, 0.5, dist1);
        scale = 1.0 - scale;

        // Add 3D lighting effect
        float height = scale;

        // Calculate normal for lighting
        vec2 eps = vec2(0.01, 0.0);
        float dx = voronoi(p + eps.xy).x - voronoi(p - eps.xy).x;
        float dy = voronoi(p + eps.yx).x - voronoi(p - eps.yx).x;
        vec3 normal = normalize(vec3(-dx, -dy, 0.1));

        // Light direction (top-left)
        vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));

        // Diffuse lighting
        float diffuse = max(dot(normal, lightDir), 0.0);
        diffuse = pow(diffuse, 1.5);

        // Ambient occlusion (shadows in crevices)
        float ao = smoothstep(0.0, 0.3, dist1);

        // Edge highlighting
        float edge = dist2 - dist1;
        float edgeHighlight = smoothstep(0.02, 0.08, edge);

        // Combine lighting
        float lighting = mix(0.4, 1.0, diffuse * ao) + edgeHighlight * 0.3;

        // Base color with subtle variation
        vec3 scaleColor = mix(primaryColor, secondaryColor, cellId);
        scaleColor += (noise(p * 3.0) - 0.5) * 0.03;

        // Apply lighting
        vec3 color = scaleColor * lighting;

        // Add specular highlights on raised parts
        float spec = pow(max(dot(normal, lightDir), 0.0), 32.0);
        color += spec * 0.15 * scale;

        // Subtle shimmer animation
        float shimmer = sin(cellId * 50.0 + time * 0.5) * 0.5 + 0.5;
        color += shimmer * 0.02 * scale;

        // Vignette
        float vignette = 1.0 - length(uv - 0.5) * 0.5;
        color *= vignette;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // Create and compile shaders
    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) return;

    // Create program
    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    // Set up geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    const resolutionLocation = gl.getUniformLocation(program, "resolution");
    const timeLocation = gl.getUniformLocation(program, "time");
    const primaryColorLocation = gl.getUniformLocation(program, "primaryColor");
    const secondaryColorLocation = gl.getUniformLocation(program, "secondaryColor");
    const isDarkLocation = gl.getUniformLocation(program, "isDark");

    // Animation loop
    let animationId: number;
    const startTime = Date.now();

    const render = () => {
      const time = (Date.now() - startTime) * 0.001;

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, time);

      // Snake skin colors - very subtle whites and grays like the image
      if (resolvedTheme === "dark") {
        gl.uniform3f(primaryColorLocation, 0.15, 0.15, 0.15);  // Dark gray
        gl.uniform3f(secondaryColorLocation, 0.08, 0.08, 0.08); // Darker gray
        gl.uniform1f(isDarkLocation, 1.0);
      } else {
        gl.uniform3f(primaryColorLocation, 0.95, 0.95, 0.95);  // Almost white
        gl.uniform3f(secondaryColorLocation, 0.88, 0.88, 0.88); // Light gray
        gl.uniform1f(isDarkLocation, 0.0);
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, [resolvedTheme]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10"
      style={{ opacity: 0.4 }}
    />
  );
}
