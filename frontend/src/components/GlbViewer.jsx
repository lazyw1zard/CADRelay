import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Camera,
  Contrast,
  Cuboid,
  Expand,
  Focus,
  Grid3X3,
  ImageDown,
  PenLine,
  Ruler,
  Rotate3D,
  Scan,
  SquareDashed,
  SunMedium,
} from "lucide-react";

const LIGHTING_PRESETS = [
  {
    id: "studio",
    label: "Студия",
    hemiIntensity: 0.95,
    hemiSky: 0xffffff,
    hemiGround: 0xc7d2fe,
    keyIntensity: 0.9,
    keyPosition: [4, 8, 5],
    fillIntensity: 0.25,
    fillPosition: [-5, 3, -4],
    exposure: 1,
  },
  {
    id: "technical",
    label: "Техсвет",
    hemiIntensity: 1.15,
    hemiSky: 0xffffff,
    hemiGround: 0xe2e8f0,
    keyIntensity: 0.55,
    keyPosition: [2, 6, 7],
    fillIntensity: 0.35,
    fillPosition: [-4, 4, -3],
    exposure: 0.96,
  },
  {
    id: "contrast",
    label: "Контраст",
    hemiIntensity: 0.55,
    hemiSky: 0xf8fafc,
    hemiGround: 0x94a3b8,
    keyIntensity: 1.35,
    keyPosition: [5, 7, 3],
    fillIntensity: 0.12,
    fillPosition: [-3, 2, -5],
    exposure: 1.04,
  },
  {
    id: "flat",
    label: "Ровный",
    hemiIntensity: 1.35,
    hemiSky: 0xffffff,
    hemiGround: 0xffffff,
    keyIntensity: 0.15,
    keyPosition: [0, 6, 4],
    fillIntensity: 0.15,
    fillPosition: [0, 3, -4],
    exposure: 0.98,
  },
];

const VIEW_LABELS = {
  iso: "3D",
  front: "2D спереди",
  right: "2D справа",
  top: "2D сверху",
};

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
    obj.geometry?.dispose?.();
    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => m?.dispose?.());
    } else {
      obj.material?.dispose?.();
    }
  });
}

export function GlbViewer({ glbUrl, onLoadMetrics }) {
  const shellRef = useRef(null);
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const modelRef = useRef(null);
  const boundsRef = useRef(null);
  const gridRef = useRef(null);
  const axesRef = useRef(null);
  const boxHelperRef = useRef(null);
  const measurementGroupRef = useRef(null);
  const measurementPointsRef = useRef([]);
  const sketchGroupRef = useRef(null);
  const lightsRef = useRef({ hemi: null, key: null, fill: null });
  const threeRef = useRef(null);
  const raycasterRef = useRef(null);
  const pointerRef = useRef(null);
  const wireframeEnabledRef = useRef(false);
  const gridEnabledRef = useRef(true);
  const axesEnabledRef = useRef(true);
  const autoRotateEnabledRef = useRef(false);
  const boundingBoxEnabledRef = useRef(false);
  const measureEnabledRef = useRef(false);
  const sketchEnabledRef = useRef(false);
  const backgroundModeRef = useRef("light");
  const lightingPresetRef = useRef("studio");
  const activeViewRef = useRef("iso");
  const [viewerError, setViewerError] = useState("");
  const [viewerLoading, setViewerLoading] = useState(false);
  const [wireframeEnabled, setWireframeEnabled] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [axesEnabled, setAxesEnabled] = useState(true);
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(false);
  const [boundingBoxEnabled, setBoundingBoxEnabled] = useState(false);
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const [sketchEnabled, setSketchEnabled] = useState(false);
  const [backgroundMode, setBackgroundMode] = useState("light");
  const [lightingPreset, setLightingPreset] = useState("studio");
  const [activeView, setActiveView] = useState("iso");
  const [modelDimensions, setModelDimensions] = useState(null);
  const [measurementDistance, setMeasurementDistance] = useState(null);

  const applyCameraView = useCallback((view = "iso") => {
    const THREE = threeRef.current;
    const controls = controlsRef.current;
    const bounds = boundsRef.current;
    const host = mountRef.current;
    if (!THREE || !controls || !bounds || !host) return;

    const { center, radius, size } = bounds;
    const width = host.clientWidth || 800;
    const height = host.clientHeight || 360;
    const aspect = width / height;
    const distance = radius * 2.2;
    const planarViews = {
      front: {
        offset: [0, 0, distance],
        up: [0, 1, 0],
        fit: [size.x, size.y],
      },
      right: {
        offset: [distance, 0, 0],
        up: [0, 1, 0],
        fit: [size.z, size.y],
      },
      top: {
        offset: [0, distance, 0],
        up: [0, 0, -1],
        fit: [size.x, size.z],
      },
    };
    const planarView = planarViews[view];
    const isPlanar = Boolean(planarView);
    let camera;

    if (isPlanar) {
      const [fitWidth, fitHeight] = planarView.fit;
      const frustumHeight = Math.max(fitHeight, fitWidth / aspect, radius * 0.25, 0.1) * 1.22;
      const frustumWidth = frustumHeight * aspect;
      camera = new THREE.OrthographicCamera(-frustumWidth / 2, frustumWidth / 2, frustumHeight / 2, -frustumHeight / 2, 0.001, radius * 20);
    } else {
      camera = new THREE.PerspectiveCamera(60, aspect, Math.max(radius / 100, 0.001), Math.max(radius * 30, 100));
    }

    const [x, y, z] = isPlanar ? planarView.offset : [distance, distance * 0.7, distance];
    const [upX, upY, upZ] = isPlanar ? planarView.up : [0, 1, 0];
    camera.up.set(upX, upY, upZ);
    camera.near = Math.max(radius / 100, 0.001);
    camera.far = Math.max(radius * 30, 100);
    camera.position.set(center.x + x, center.y + y, center.z + z);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    cameraRef.current = camera;
    controls.object = camera;
    controls.target.copy(center);
    controls.enableRotate = !isPlanar;
    controls.autoRotate = isPlanar ? false : autoRotateEnabledRef.current;
    controls.update();

    activeViewRef.current = isPlanar ? view : "iso";
    setActiveView(activeViewRef.current);
  }, []);

  const setModelWireframe = useCallback((enabled) => {
    const model = modelRef.current;
    if (!model) return;
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((material) => {
        if (material) material.wireframe = enabled;
      });
    });
  }, []);

  const restoreSketchMaterials = useCallback(() => {
    const model = modelRef.current;
    if (!model) return;
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((material) => {
        const original = material?.userData?.cadrelaySketchOriginal;
        if (!material || !original) return;
        material.transparent = original.transparent;
        material.opacity = original.opacity;
        material.depthWrite = original.depthWrite;
        material.needsUpdate = true;
        delete material.userData.cadrelaySketchOriginal;
      });
    });
  }, []);

  const disposeSketchEdges = useCallback(() => {
    const group = sketchGroupRef.current;
    if (!group) return;
    group.parent?.remove?.(group);
    disposeScene(group);
    sketchGroupRef.current = null;
  }, []);

  const applySketchMode = useCallback(
    (enabled) => {
      const THREE = threeRef.current;
      const scene = sceneRef.current;
      const model = modelRef.current;
      if (!THREE || !scene || !model) return;

      restoreSketchMaterials();
      disposeSketchEdges();

      if (!enabled) return;

      const edgeGroup = new THREE.Group();
      edgeGroup.name = "CADRelaySketchEdges";
      model.updateMatrixWorld(true);

      model.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry) return;
        const edgeGeometry = new THREE.EdgesGeometry(obj.geometry, 28);
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: backgroundModeRef.current === "dark" ? 0xe5e7eb : 0x111827,
          transparent: true,
          opacity: 0.92,
          depthTest: true,
        });
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        edges.matrix.copy(obj.matrixWorld);
        edges.matrixAutoUpdate = false;
        edgeGroup.add(edges);

        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach((material) => {
          if (!material) return;
          material.userData.cadrelaySketchOriginal = {
            transparent: material.transparent,
            opacity: material.opacity,
            depthWrite: material.depthWrite,
          };
          material.transparent = true;
          material.opacity = 0.055;
          material.depthWrite = false;
          material.needsUpdate = true;
        });
      });

      sketchGroupRef.current = edgeGroup;
      scene.add(edgeGroup);
    },
    [disposeSketchEdges, restoreSketchMaterials]
  );

  const applyBackground = useCallback((mode) => {
    const THREE = threeRef.current;
    const scene = sceneRef.current;
    if (!THREE || !scene) return;
    scene.background = new THREE.Color(mode === "dark" ? 0x0f141a : 0xf4f6f8);
    if (sketchEnabledRef.current) applySketchMode(true);
  }, [applySketchMode]);

  const applyLightingPreset = useCallback((presetId) => {
    const THREE = threeRef.current;
    const renderer = rendererRef.current;
    const { hemi, key, fill } = lightsRef.current;
    const preset = LIGHTING_PRESETS.find((item) => item.id === presetId) || LIGHTING_PRESETS[0];
    if (!THREE || !hemi || !key || !fill) return;

    hemi.color.setHex(preset.hemiSky);
    hemi.groundColor.setHex(preset.hemiGround);
    hemi.intensity = preset.hemiIntensity;

    key.color.setHex(0xffffff);
    key.intensity = preset.keyIntensity;
    key.position.set(...preset.keyPosition);

    fill.color.setHex(0xffffff);
    fill.intensity = preset.fillIntensity;
    fill.position.set(...preset.fillPosition);

    if (renderer) renderer.toneMappingExposure = preset.exposure;
  }, []);

  const clearMeasurement = useCallback(() => {
    const group = measurementGroupRef.current;
    if (group) {
      group.children.forEach((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material?.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      });
      group.clear();
    }
    measurementPointsRef.current = [];
    setMeasurementDistance(null);
  }, []);

  const handleToggleWireframe = useCallback(() => {
    setWireframeEnabled((prev) => {
      const next = !prev;
      wireframeEnabledRef.current = next;
      setModelWireframe(next);
      return next;
    });
  }, [setModelWireframe]);

  const handleToggleGrid = useCallback(() => {
    setGridEnabled((prev) => {
      const next = !prev;
      gridEnabledRef.current = next;
      if (gridRef.current) gridRef.current.visible = next;
      return next;
    });
  }, []);

  const handleToggleAxes = useCallback(() => {
    setAxesEnabled((prev) => {
      const next = !prev;
      axesEnabledRef.current = next;
      if (axesRef.current) axesRef.current.visible = next;
      return next;
    });
  }, []);

  const handleToggleAutoRotate = useCallback(() => {
    setAutoRotateEnabled((prev) => {
      const next = !prev;
      autoRotateEnabledRef.current = next;
      if (controlsRef.current && activeViewRef.current === "iso") controlsRef.current.autoRotate = next;
      return next;
    });
  }, []);

  const handleToggleBoundingBox = useCallback(() => {
    setBoundingBoxEnabled((prev) => {
      const next = !prev;
      boundingBoxEnabledRef.current = next;
      if (boxHelperRef.current) boxHelperRef.current.visible = next;
      return next;
    });
  }, []);

  const handleToggleMeasure = useCallback(() => {
    setMeasureEnabled((prev) => {
      const next = !prev;
      measureEnabledRef.current = next;
      if (!next) clearMeasurement();
      return next;
    });
  }, [clearMeasurement]);

  const handleToggleSketch = useCallback(() => {
    const next = !sketchEnabledRef.current;
    sketchEnabledRef.current = next;
    setSketchEnabled(next);
    if (next) {
      wireframeEnabledRef.current = false;
      setWireframeEnabled(false);
      setModelWireframe(false);
    }
    applySketchMode(next);
  }, [applySketchMode, setModelWireframe]);

  const handleToggleBackground = useCallback(() => {
    setBackgroundMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      backgroundModeRef.current = next;
      applyBackground(next);
      return next;
    });
  }, [applyBackground]);

  const handleToggleLighting = useCallback(() => {
    setLightingPreset((prev) => {
      const index = LIGHTING_PRESETS.findIndex((item) => item.id === prev);
      const next = LIGHTING_PRESETS[(index + 1) % LIGHTING_PRESETS.length];
      lightingPresetRef.current = next.id;
      applyLightingPreset(next.id);
      return next.id;
    });
  }, [applyLightingPreset]);

  const handleFullscreen = useCallback(async () => {
    if (!shellRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await shellRef.current.requestFullscreen();
      }
    } catch {
      // Fullscreen can be blocked by browser policy; ignore silently.
    }
  }, []);

  const handleScreenshot = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const url = renderer.domElement.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "cadrelay-render.png";
    a.click();
  }, []);

  const handleMeasurePointer = useCallback(
    (event) => {
      if (!measureEnabledRef.current) return;
      const THREE = threeRef.current;
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      const model = modelRef.current;
      const raycaster = raycasterRef.current;
      const pointer = pointerRef.current;
      const group = measurementGroupRef.current;
      const bounds = boundsRef.current;
      if (!THREE || !renderer || !camera || !model || !raycaster || !pointer || !group || !bounds) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(model, true)[0];
      if (!hit) return;

      if (measurementPointsRef.current.length >= 2) clearMeasurement();

      const point = hit.point.clone();
      measurementPointsRef.current = [...measurementPointsRef.current, point];

      const markerGeometry = new THREE.SphereGeometry(Math.max(bounds.radius * 0.018, 0.01), 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x147a68, depthTest: false });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(point);
      marker.renderOrder = 10;
      group.add(marker);

      if (measurementPointsRef.current.length === 2) {
        const [start, end] = measurementPointsRef.current;
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x147a68, depthTest: false });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.renderOrder = 9;
        group.add(line);
        setMeasurementDistance(start.distanceTo(end));
      }
    },
    [clearMeasurement]
  );

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
      setModelDimensions(null);
      setMeasurementDistance(null);

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
        threeRef.current = THREE;
        raycasterRef.current = new THREE.Raycaster();
        pointerRef.current = new THREE.Vector2();
        const host = mountRef.current;
        const width = host.clientWidth || 800;
        const height = host.clientHeight || 360;

        scene = new THREE.Scene();
        sceneRef.current = scene;
        applyBackground(backgroundModeRef.current);

        camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 5000);
        camera.position.set(1.8, 1.2, 1.8);
        cameraRef.current = camera;

        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height);
        rendererRef.current = renderer;
        host.innerHTML = "";
        host.appendChild(renderer.domElement);
        // Пресеты меняют параметры этих же источников света, без пересоздания сцены.
        const hemi = new THREE.HemisphereLight(0xffffff, 0xc7d2fe, 0.9);
        scene.add(hemi);
        const key = new THREE.DirectionalLight(0xffffff, 0.95);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.2);
        scene.add(fill);
        lightsRef.current = { hemi, key, fill };
        applyLightingPreset(lightingPresetRef.current);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = autoRotateEnabledRef.current;
        controls.autoRotateSpeed = 1.2;
        controls.target.set(0, 0, 0);
        controls.update();
        controlsRef.current = controls;

        gridRef.current = new THREE.GridHelper(10, 20, 0x94a3b8, 0xd7dee5);
        gridRef.current.visible = gridEnabledRef.current;
        scene.add(gridRef.current);

        axesRef.current = new THREE.AxesHelper(1.8);
        axesRef.current.visible = axesEnabledRef.current;
        scene.add(axesRef.current);

        measurementGroupRef.current = new THREE.Group();
        scene.add(measurementGroupRef.current);

        const loader = new GLTFLoader();
        const startedAt = performance.now();
        const withCacheBypass = `${glbUrl}${glbUrl.includes("?") ? "&" : "?"}ts=${Date.now()}`;

        loader.load(
          withCacheBypass,
          (gltf) => {
            if (disposed) return;
            currentModel = gltf.scene;
            modelRef.current = currentModel;
            scene.add(currentModel);

            // Автокадрирование камеры вокруг модели.
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const radius = Math.max(size.x, size.y, size.z, 0.1);
            boundsRef.current = { center, radius, box, size };
            setModelDimensions({ x: size.x, y: size.y, z: size.z });

            boxHelperRef.current = new THREE.BoxHelper(currentModel, 0x147a68);
            boxHelperRef.current.visible = boundingBoxEnabledRef.current;
            scene.add(boxHelperRef.current);

            if (gridRef.current) {
              gridRef.current.scale.setScalar(radius);
              gridRef.current.position.set(center.x, box.min.y, center.z);
            }
            if (axesRef.current) {
              axesRef.current.scale.setScalar(radius * 0.35);
              axesRef.current.position.copy(center);
            }
            setModelWireframe(wireframeEnabledRef.current);
            applySketchMode(sketchEnabledRef.current);
            applyCameraView("iso");

            const loadMs = Math.round(performance.now() - startedAt);
            const triangles = countTriangles(currentModel);
            onLoadMetrics?.({ loadMs, triangles, dimensions: { x: size.x, y: size.y, z: size.z } });
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
          renderer.render(scene, cameraRef.current || camera);
          animationId = requestAnimationFrame(animate);
        };
        animate();

        resizeHandler = () => {
          const activeCamera = cameraRef.current;
          if (!renderer || !activeCamera || !mountRef.current) return;
          const w = mountRef.current.clientWidth || width;
          const h = mountRef.current.clientHeight || height;
          renderer.setSize(w, h);
          applyCameraView(activeViewRef.current);
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
      restoreSketchMaterials();
      disposeSketchEdges();
      if (currentModel) disposeScene(currentModel);
      if (boxHelperRef.current) disposeScene(boxHelperRef.current);
      if (measurementGroupRef.current) disposeScene(measurementGroupRef.current);
      renderer?.dispose?.();
      if (renderer?.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      modelRef.current = null;
      boundsRef.current = null;
      gridRef.current = null;
      axesRef.current = null;
      boxHelperRef.current = null;
      measurementGroupRef.current = null;
      measurementPointsRef.current = [];
      sketchGroupRef.current = null;
      lightsRef.current = { hemi: null, key: null, fill: null };
      threeRef.current = null;
      raycasterRef.current = null;
      pointerRef.current = null;
    };
  }, [
    applyBackground,
    applyCameraView,
    applyLightingPreset,
    applySketchMode,
    disposeSketchEdges,
    glbUrl,
    onLoadMetrics,
    restoreSketchMaterials,
    setModelWireframe,
  ]);

  return (
    <div ref={shellRef} className="viewer-shell">
      <div className="viewer-toolbar" aria-label="Инструменты 3D просмотра">
        <button
          type="button"
          className={`icon-btn ${activeView === "iso" ? "viewer-tool-active" : ""}`}
          onClick={() => applyCameraView("iso")}
          title="3D изометрия"
          aria-label="Вернуть 3D изометрию"
        >
          <Focus size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${activeView === "front" ? "viewer-tool-active" : ""}`}
          onClick={() => applyCameraView("front")}
          title="2D вид спереди"
          aria-label="2D вид спереди"
        >
          <Camera size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${activeView === "right" ? "viewer-tool-active" : ""}`}
          onClick={() => applyCameraView("right")}
          title="2D вид справа"
          aria-label="2D вид справа"
        >
          <Cuboid size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${activeView === "top" ? "viewer-tool-active" : ""}`}
          onClick={() => applyCameraView("top")}
          title="2D вид сверху"
          aria-label="2D вид сверху"
        >
          <Scan size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${wireframeEnabled ? "viewer-tool-active" : ""}`}
          onClick={handleToggleWireframe}
          title="Каркас"
          aria-label="Переключить каркас"
        >
          <SquareDashed size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${sketchEnabled ? "viewer-tool-active" : ""}`}
          onClick={handleToggleSketch}
          title="Эскизный контур"
          aria-label="Переключить эскизный контур"
        >
          <PenLine size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${gridEnabled ? "viewer-tool-active" : ""}`}
          onClick={handleToggleGrid}
          title="Сетка"
          aria-label="Переключить сетку"
        >
          <Grid3X3 size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${axesEnabled ? "viewer-tool-active" : ""}`}
          onClick={handleToggleAxes}
          title="Оси"
          aria-label="Переключить оси"
        >
          <Rotate3D size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${autoRotateEnabled ? "viewer-tool-active" : ""}`}
          onClick={handleToggleAutoRotate}
          title="Автовращение"
          aria-label="Переключить автовращение"
        >
          <Rotate3D size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${backgroundMode === "dark" ? "viewer-tool-active" : ""}`}
          onClick={handleToggleBackground}
          title="Фон"
          aria-label="Переключить фон"
        >
          <Contrast size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={handleToggleLighting}
          title={`Свет: ${LIGHTING_PRESETS.find((item) => item.id === lightingPreset)?.label || "Студия"}`}
          aria-label="Переключить свет"
        >
          <SunMedium size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${boundingBoxEnabled ? "viewer-tool-active" : ""}`}
          onClick={handleToggleBoundingBox}
          title="Bounding box"
          aria-label="Переключить bounding box"
        >
          <Box size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn ${measureEnabled ? "viewer-tool-active" : ""}`}
          onClick={handleToggleMeasure}
          title="Измерить расстояние"
          aria-label="Измерить расстояние"
        >
          <Ruler size={17} />
        </button>
        <button type="button" className="icon-btn" onClick={handleScreenshot} title="Снимок" aria-label="Скачать снимок">
          <ImageDown size={17} />
        </button>
        <button type="button" className="icon-btn" onClick={handleFullscreen} title="На весь экран" aria-label="Переключить полноэкранный режим">
          <Expand size={17} />
        </button>
      </div>
      <div ref={mountRef} className="viewer-canvas" onPointerDownCapture={handleMeasurePointer} />
      {(modelDimensions || measureEnabled) && (
        <div className="viewer-readout">
          {modelDimensions ? (
            <span>
              Габариты: {modelDimensions.x.toFixed(2)} x {modelDimensions.y.toFixed(2)} x {modelDimensions.z.toFixed(2)}
            </span>
          ) : null}
          {measureEnabled ? (
            <span>{measurementDistance === null ? "Измерение: выбери 2 точки" : `Расстояние: ${measurementDistance.toFixed(2)}`}</span>
          ) : null}
          {sketchEnabled ? <span>Режим: эскиз</span> : null}
          <span>Вид: {VIEW_LABELS[activeView] || "3D"}</span>
          <span>Свет: {LIGHTING_PRESETS.find((item) => item.id === lightingPreset)?.label || "Студия"}</span>
        </div>
      )}
      {viewerLoading ? <p className="muted">Загрузка GLB...</p> : null}
      {viewerError ? <p className="error">{viewerError}</p> : null}
    </div>
  );
}
