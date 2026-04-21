from __future__ import annotations

import zipfile
from pathlib import Path

import pytest
import trimesh

from worker.app.converter import convert_cad_file_to_glb_bytes


def _create_step_or_iges(path: Path) -> None:
    try:
        import gmsh  # type: ignore
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"gmsh unavailable for {path.suffix}: {exc}")

    initialized = False
    try:
        gmsh.initialize()
        initialized = True
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.model.add("cadrelay_smoke")
        gmsh.model.occ.addBox(0, 0, 0, 10, 8, 6)
        gmsh.model.occ.synchronize()
        gmsh.write(str(path))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"gmsh can't write {path.suffix}: {exc}")
    finally:
        if initialized:
            try:
                gmsh.finalize()
            except Exception:  # noqa: BLE001
                pass


def _create_stl(path: Path) -> None:
    mesh = trimesh.creation.cylinder(radius=3, height=7, sections=20)
    mesh.export(path)


def _create_obj(path: Path) -> None:
    mesh = trimesh.creation.icosphere(subdivisions=2, radius=5)
    mesh.export(path)


def _create_3mf(path: Path) -> None:
    content_types = """<?xml version='1.0' encoding='UTF-8'?>
<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>
  <Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>
  <Default Extension='model' ContentType='application/vnd.ms-package.3dmanufacturing-3dmodel+xml'/>
</Types>
"""
    rels = """<?xml version='1.0' encoding='UTF-8'?>
<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>
  <Relationship Target='/3D/3dmodel.model' Id='rel0' Type='http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel'/>
</Relationships>
"""
    model = """<?xml version='1.0' encoding='UTF-8'?>
<model unit='millimeter' xml:lang='en-US' xmlns='http://schemas.microsoft.com/3dmanufacturing/core/2015/02'>
  <resources>
    <object id='1' type='model'>
      <mesh>
        <vertices>
          <vertex x='0' y='0' z='0'/>
          <vertex x='20' y='0' z='0'/>
          <vertex x='0' y='20' z='0'/>
        </vertices>
        <triangles>
          <triangle v1='0' v2='1' v3='2'/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid='1'/></build>
</model>
"""
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("3D/3dmodel.model", model)


@pytest.mark.parametrize(
    ("suffix", "builder"),
    [
        (".step", _create_step_or_iges),
        (".iges", _create_step_or_iges),
        (".3mf", _create_3mf),
        (".stl", _create_stl),
        (".obj", _create_obj),
    ],
)
def test_convert_supported_sources_to_glb(tmp_path: Path, suffix: str, builder) -> None:
    source = tmp_path / f"sample{suffix}"
    builder(source)

    glb_bytes = convert_cad_file_to_glb_bytes(source, profile="balanced")

    assert isinstance(glb_bytes, (bytes, bytearray))
    assert len(glb_bytes) > 64
    assert glb_bytes[:4] == b"glTF"
