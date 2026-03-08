import { useEffect, useRef, useState } from "react";

function countTriangles(root) {
  let total = 0;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const geom = obj.geometry;
    if (!geom) return;
    if (geom.index) {
      total += Math.floor(geom.index.count / 3);
    } else if (geom.attributes?.position) {
      total += Math.floor(geom.attributes.position.count / 3);
    }
  });
  return total;
}

function disposeScene(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => m?.dispose?.());
    } else {
      obj.material?.dispose?.();
    }
  });
}

export function GlbViewer({ glbUrl, onLoadMetrics }) {
  const mountRef = useRef(null);
  const [viewerError, setViewerError] = useState("");
  const [viewerLoading, setViewerLoading] = useState(false);

  useEffect(() => {
    let disposed = false;
    let renderer;
    let controls;
    let scene;
    let camera;
    let currentModel = null;
    let animationId = 0;
    let resizeHandler = null;

    async function initViewer() {
      if (!mountRef.current) return;
      setViewerError("");
      setViewerLoading(true);

      try {
        // Ленивая загрузка heavy-библиотек только когда реально открыли preview.
        const [THREE, controlsMod, loaderMod] = await Promise.all([
          import("three"),
          import("three/examples/jsm/controls/OrbitControls.js"),
          import("three/examples/jsm/loaders/GLTFLoader.js"),
        ]);

        if (disposed || !mountRef.current) return;

        const { OrbitControls } = controlsMod;
        const { GLTFLoader } = loaderMod;
        const host = mountRef.current;
        const width = host.clientWidth || 800;
        const height = host.clientHeight || 360;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf7f9ff);

        camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 5000);
        camera.position.set(1.8, 1.2, 1.8);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height);
        host.innerHTML = "";
        host.appendChild(renderer.domElement);

        // Базовый свет для читаемого preview.
        const hemi = new THREE.HemisphereLight(0xffffff, 0xc7d2fe, 0.9);
        scene.add(hemi);
        const dir = new THREE.DirectionalLight(0xffffff, 0.95);
        dir.position.set(4, 8, 5);
        scene.add(dir);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, 0, 0);
        controls.update();

        const loader = new GLTFLoader();
        const startedAt = performance.now();
        const withCacheBypass = `${glbUrl}${glbUrl.includes("?") ? "&" : "?"}ts=${Date.now()}`;

        loader.load(
          withCacheBypass,
          (gltf) => {
            if (disposed) return;
            currentModel = gltf.scene;
            scene.add(currentModel);

            // Автокадрирование камеры вокруг модели.
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const radius = Math.max(size.x, size.y, size.z, 0.1);
            const distance = radius * 1.8;

            camera.near = Math.max(radius / 100, 0.001);
            camera.far = Math.max(radius * 20, 100);
            camera.position.set(center.x + distance, center.y + distance * 0.65, center.z + distance);
            camera.lookAt(center);
            camera.updateProjectionMatrix();
            controls.target.copy(center);
            controls.update();

            const loadMs = Math.round(performance.now() - startedAt);
            const triangles = countTriangles(currentModel);
            onLoadMetrics?.({ loadMs, triangles });
            setViewerLoading(false);
          },
          undefined,
          (err) => {
            if (disposed) return;
            setViewerError(`Не удалось загрузить GLB: ${err?.message || "unknown error"}`);
            setViewerLoading(false);
          }
        );

        const animate = () => {
          if (disposed) return;
          controls.update();
          renderer.render(scene, camera);
          animationId = requestAnimationFrame(animate);
        };
        animate();

        resizeHandler = () => {
          if (!renderer || !camera || !mountRef.current) return;
          const w = mountRef.current.clientWidth || width;
          const h = mountRef.current.clientHeight || height;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener("resize", resizeHandler);
      } catch (err) {
        if (disposed) return;
        setViewerError(`Viewer init error: ${err?.message || "unknown error"}`);
        setViewerLoading(false);
      }
    }

    initViewer();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      controls?.dispose?.();
      if (currentModel) disposeScene(currentModel);
      renderer?.dispose?.();
      if (renderer?.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [glbUrl, onLoadMetrics]);

  return (
    <div className="viewer-shell">
      <div ref={mountRef} className="viewer-canvas" />
      {viewerLoading ? <p className="muted">Загрузка GLB...</p> : null}
      {viewerError ? <p className="error">{viewerError}</p> : null}
    </div>
  );
}
