from __future__ import annotations

from pathlib import Path
import tempfile

import gmsh
import trimesh


def _scene_to_single_mesh(scene: trimesh.Scene) -> trimesh.Trimesh:
    # Если trimesh вернул сцену из нескольких объектов, склеиваем их в один mesh.
    geometries = list(scene.geometry.values())
    if not geometries:
        raise RuntimeError("Trimesh scene has no geometry")
    return trimesh.util.concatenate(geometries)


def convert_cad_file_to_glb_bytes(input_path: Path) -> bytes:
    # 1) Через gmsh импортируем CAD (STEP/IGES), строим треугольную сетку и пишем STL.
    # 2) Через trimesh читаем STL и экспортируем GLB-байты.
    with tempfile.TemporaryDirectory(prefix="cadrelay_convert_") as tmp_dir:
        tmp = Path(tmp_dir)
        stl_path = tmp / "mesh.stl"

        gmsh.initialize()
        try:
            gmsh.option.setNumber("General.Terminal", 0)
            gmsh.model.add("cadrelay")
            gmsh.model.occ.importShapes(str(input_path))
            gmsh.model.occ.synchronize()
            gmsh.model.mesh.generate(2)
            gmsh.write(str(stl_path))
        finally:
            gmsh.finalize()

        # force='mesh' гарантирует, что мы получим mesh/scene, а не "непонятный" тип.
        loaded = trimesh.load(stl_path, force="mesh")
        if isinstance(loaded, trimesh.Scene):
            mesh = _scene_to_single_mesh(loaded)
        else:
            mesh = loaded

        if mesh.is_empty:
            raise RuntimeError("Converted mesh is empty")

        glb = mesh.export(file_type="glb")
        if isinstance(glb, str):
            glb = glb.encode("utf-8")
        return glb
