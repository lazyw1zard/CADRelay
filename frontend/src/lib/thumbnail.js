let modulesPromise = null;

async function getThreeModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
    ]);
  }
  return modulesPromise;
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

// Рендерит GLB в offscreen-canvas и возвращает PNG data URL.
export async function generateGlbThumbnail(glbUrl, width = 184, height = 124) {
  const [THREE, loaderMod] = await getThreeModules();
  const { GLTFLoader } = loaderMod;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f9ff);
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 5000);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xc7d2fe, 0.95);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(4, 8, 5);
  scene.add(dir);

  const loader = new GLTFLoader();
  const withCacheBypass = `${glbUrl}${glbUrl.includes("?") ? "&" : "?"}thumb_ts=${Date.now()}`;
  // Защита от "вечной" загрузки: если GLB не пришел за 15с, считаем попытку failed.
  const gltf = await Promise.race([
    loader.loadAsync(withCacheBypass),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("thumbnail timeout")), 15000);
    }),
  ]);
  scene.add(gltf.scene);

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.1);
  const distance = radius * 1.75;

  camera.near = Math.max(radius / 100, 0.001);
  camera.far = Math.max(radius * 20, 100);
  camera.position.set(center.x + distance, center.y + distance * 0.62, center.z + distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const png = renderer.domElement.toDataURL("image/png");

  disposeScene(gltf.scene);
  renderer.dispose();
  return png;
}
