from __future__ import annotations

from pathlib import Path
import tempfile

import trimesh

SUPPORTED_PROFILES = {"fast", "balanced", "high"}


def _get_gmsh():
    # Импортируем gmsh только когда реально нужна CAD-ветка (STEP/IGES).
    try:
        import gmsh  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("CAD conversion requires 'gmsh' package and native libs") from exc
    return gmsh


def _apply_profile(profile: str, gmsh_mod) -> str:
    # Профили качества влияют на плотность сетки:
    # fast -> меньше треугольников и быстрее,
    # balanced -> базовый компромисс,
    # high -> плотнее и точнее, но тяжелее.
    normalized = profile.lower().strip()
    if normalized not in SUPPORTED_PROFILES:
        normalized = "balanced"

    if normalized == "fast":
        gmsh_mod.option.setNumber("Mesh.CharacteristicLengthFactor", 2.0)
    elif normalized == "high":
        gmsh_mod.option.setNumber("Mesh.CharacteristicLengthFactor", 0.6)
    else:
        gmsh_mod.option.setNumber("Mesh.CharacteristicLengthFactor", 1.0)
    return normalized


def _scene_to_single_mesh(scene: trimesh.Scene) -> trimesh.Trimesh:
    # Если trimesh вернул сцену из нескольких объектов, склеиваем их в один mesh.
    geometries = list(scene.geometry.values())
    if not geometries:
        raise RuntimeError("Trimesh scene has no geometry")
    return trimesh.util.concatenate(geometries)


def _load_mesh_from_scene(input_path: Path) -> trimesh.Trimesh:
    # Для 3mf читаем как scene (там может быть несколько объектов).
    loaded = trimesh.load(input_path, force="scene")
    if isinstance(loaded, trimesh.Scene):
        mesh = _scene_to_single_mesh(loaded)
    else:
        mesh = loaded
    if mesh.is_empty:
        raise RuntimeError("Converted mesh is empty")
    return mesh


def convert_cad_file_to_glb_bytes(input_path: Path, profile: str = "balanced") -> bytes:
    # 3mf уже mesh-формат, поэтому конвертируем его напрямую через trimesh.
    if input_path.suffix.lower() == ".3mf":
        try:
            mesh = _load_mesh_from_scene(input_path)
        except ModuleNotFoundError as exc:
            # Для чтения 3mf trimesh использует дополнительные пакеты.
            if exc.name == "networkx":
                raise RuntimeError("3mf support requires 'networkx' package") from exc
            if exc.name == "lxml":
                raise RuntimeError("3mf support requires 'lxml' package") from exc
            raise
        glb = mesh.export(file_type="glb")
        if isinstance(glb, str):
            glb = glb.encode("utf-8")
        return glb

    # STL тоже mesh-формат: читаем напрямую и сразу экспортируем в GLB.
    if input_path.suffix.lower() == ".stl":
        mesh = trimesh.load(input_path, force="mesh")
        if isinstance(mesh, trimesh.Scene):
            mesh = _scene_to_single_mesh(mesh)
        if mesh.is_empty:
            raise RuntimeError("Converted mesh is empty")
        glb = mesh.export(file_type="glb")
        if isinstance(glb, str):
            glb = glb.encode("utf-8")
        return glb

    # OBJ тоже mesh-формат: читаем как scene, чтобы не потерять многодетальные модели.
    if input_path.suffix.lower() == ".obj":
        mesh = _load_mesh_from_scene(input_path)
        glb = mesh.export(file_type="glb")
        if isinstance(glb, str):
            glb = glb.encode("utf-8")
        return glb

    # 1) Через gmsh импортируем CAD (STEP/IGES), строим треугольную сетку и пишем STL.
    # 2) Через trimesh читаем STL и экспортируем GLB-байты.
    with tempfile.TemporaryDirectory(prefix="cadrelay_convert_") as tmp_dir:
        tmp = Path(tmp_dir)
        stl_path = tmp / "mesh.stl"
        gmsh_mod = _get_gmsh()

        gmsh_mod.initialize()
        try:
            gmsh_mod.option.setNumber("General.Terminal", 0)
            _apply_profile(profile, gmsh_mod)
            gmsh_mod.model.add("cadrelay")
            gmsh_mod.model.occ.importShapes(str(input_path))
            gmsh_mod.model.occ.synchronize()
            gmsh_mod.model.mesh.generate(2)
            gmsh_mod.write(str(stl_path))
        finally:
            gmsh_mod.finalize()

        # STL после gmsh читаем напрямую как mesh (так стабильнее для старого пути).
        mesh = trimesh.load(stl_path, force="mesh")
        if isinstance(mesh, trimesh.Scene):
            mesh = _scene_to_single_mesh(mesh)
        if mesh.is_empty:
            raise RuntimeError("Converted mesh is empty")

        glb = mesh.export(file_type="glb")
        if isinstance(glb, str):
            glb = glb.encode("utf-8")
        return glb
