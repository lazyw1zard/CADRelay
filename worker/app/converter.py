from __future__ import annotations

from pathlib import Path
import tempfile

import gmsh
import trimesh

SUPPORTED_PROFILES = {"fast", "balanced", "high"}


def _apply_profile(profile: str) -> str:
    # Профили качества влияют на плотность сетки:
    # fast -> меньше треугольников и быстрее,
    # balanced -> базовый компромисс,
    # high -> плотнее и точнее, но тяжелее.
    normalized = profile.lower().strip()
    if normalized not in SUPPORTED_PROFILES:
        normalized = "balanced"

    if normalized == "fast":
        gmsh.option.setNumber("Mesh.CharacteristicLengthFactor", 2.0)
    elif normalized == "high":
        gmsh.option.setNumber("Mesh.CharacteristicLengthFactor", 0.6)
    else:
        gmsh.option.setNumber("Mesh.CharacteristicLengthFactor", 1.0)
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

    # 1) Через gmsh импортируем CAD (STEP/IGES), строим треугольную сетку и пишем STL.
    # 2) Через trimesh читаем STL и экспортируем GLB-байты.
    with tempfile.TemporaryDirectory(prefix="cadrelay_convert_") as tmp_dir:
        tmp = Path(tmp_dir)
        stl_path = tmp / "mesh.stl"

        gmsh.initialize()
        try:
            gmsh.option.setNumber("General.Terminal", 0)
            _apply_profile(profile)
            gmsh.model.add("cadrelay")
            gmsh.model.occ.importShapes(str(input_path))
            gmsh.model.occ.synchronize()
            gmsh.model.mesh.generate(2)
            gmsh.write(str(stl_path))
        finally:
            gmsh.finalize()

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
