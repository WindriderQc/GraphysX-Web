import {
  BoxGeometry,
  Group,
  Mesh,
  MeshPhongMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3
} from "three";

export const NOTES_MANAGER_EVIDENCE = {
  classification: "implemented-3d-subsystem-with-incomplete-gui" as const,
  authoritativeSources: [
    "AtmelCubx/AtmelCubx/NotesManager.cpp",
    "AtmelCubx/AtmelCubx/BlocNote.cpp",
    "AtmelCubx/AtmelCubx/Note.cpp",
    "AtmelCubx/AtmelCubx/Area.cpp",
    "AtmelCubx/AtmelCubx/NoteMgrGUI.cpp"
  ],
  duplicateBranches: [
    "Yanik C++ BCKUP/AtmelCubx",
    "Yanik C++ BCKUP/AtmelCubx 1",
    "Yanik C++ BCKUP/AtmelCubxCar"
  ],
  exactFacts: {
    blockName: "Default",
    rank: 1,
    capacity: 50,
    depth: 10,
    noteSize: [50, 50, 10] as const,
    addButtonSize: [30, 30, 30] as const,
    addButtonPosition: [0, -250, 0] as const,
    initialActiveNotes: 0,
    texture: "Media\\marble10.jpg",
    material: {
      ambient: [0.1, 0.1, 0.1, 1] as const,
      diffuse: [0.8, 0.8, 0.8, 1] as const,
      specular: [0.2, 0.2, 0.2, 1] as const,
      power: 20,
      emissive: [0, 0, 0, 1] as const
    }
  },
  integrationFacts: {
    notesManagerConstructedBy: "CLArea::Init3DEnvironnement",
    renderedBy: "CLArea::RenderArea CUBX_MODE branch",
    clickFlow: "add-note mesh -> SelectGUI(NOTEMGR_GUIMODE) -> AddNote()",
    noteManagerModeDeclared: true,
    noteManagerModeHasDedicatedRenderBranch: false
  },
  unavailableOrUnimplemented: [
    "GUI/NoteMgrGUI.layout is referenced but absent from the workspace, the AtmelCubx63_2003.rar file list, and the external StockRoom search.",
    "The recovered CEGUI class only wires a QuitBtn callback that returns true and fetches an otherwise unused NoteWnd.",
    "No recovered code stores note text or implements edit, delete, reorder, save, or load.",
    "No Notes-specific camera, backdrop, screenshot, or standalone scene transition is serialized."
  ]
} as const;

export interface NotesManagerState {
  kind: "notes-manager-3d-block";
  loadStatus: "loading" | "ready" | "error";
  activeNotes: number;
  capacity: 50;
  nextNoteIndex: number | null;
  addButtonPosition: [number, number, number];
  activeNotePositions: Array<[number, number, number]>;
  fullGuiRecoverable: false;
}
const NOTE_WIDTH = 50;
const NOTE_HEIGHT = 50;
const NOTE_DEPTH = 10;
const CAPACITY = 50;
const ROW_DEPTH = 10;

function exactNotePosition(index: number): Vector3 {
  const column = Math.floor(index / ROW_DEPTH);
  const columnRank = index % ROW_DEPTH;
  const x = column * (NOTE_WIDTH + NOTE_WIDTH / 2);
  const y = NOTE_HEIGHT;
  const z = columnRank === 0 ? 0 : columnRank * NOTE_DEPTH * 2;
  return new Vector3(x, y, z);
}

function tuple(position: Vector3): [number, number, number] {
  return [position.x, position.y, position.z];
}

export class NotesManagerEnvironment {
  readonly group = new Group();
  readonly noteMeshes: Mesh<BoxGeometry, MeshPhongMaterial>[] = [];
  readonly addNoteButton: Mesh<BoxGeometry, MeshPhongMaterial>;
  readonly ready: Promise<void>;

  private readonly material: MeshPhongMaterial;
  private activeNotes = 0;
  private loadStatus: NotesManagerState["loadStatus"] = "loading";

  constructor() {
    this.group.name = "NotesManager.DefaultBlock";
    this.group.userData.evidence = NOTES_MANAGER_EVIDENCE;

    this.material = new MeshPhongMaterial({
      color: 0xcccccc,
      emissive: 0x000000,
      specular: 0x333333,
      shininess: 20
    });

    const noteGeometry = new BoxGeometry(NOTE_WIDTH, NOTE_HEIGHT, NOTE_DEPTH);
    for (let index = 0; index < CAPACITY; index += 1) {
      const mesh = new Mesh(noteGeometry, this.material);
      mesh.name = `NoteMesh.${index}`;
      mesh.position.copy(exactNotePosition(index));
      mesh.visible = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.archiveName = "NoteMesh";
      mesh.userData.noteIndex = index;
      this.noteMeshes.push(mesh);
      this.group.add(mesh);
    }

    this.addNoteButton = new Mesh(new BoxGeometry(30, 30, 30), this.material);
    this.addNoteButton.name = "AddNoteBtn";
    this.addNoteButton.position.set(0, -250, 0);
    this.addNoteButton.castShadow = true;
    this.addNoteButton.receiveShadow = true;
    this.group.add(this.addNoteButton);

    const loader = new TextureLoader();
    this.ready = loader
      .loadAsync("/assets/archives/notes-manager/marble10.jpg")
      .then((texture) => {
        texture.colorSpace = SRGBColorSpace;
        this.material.map = texture;
        this.material.needsUpdate = true;
        this.loadStatus = "ready";
      })
      .catch((error: unknown) => {
        this.loadStatus = "error";
        throw error;
      });
  }

  addNote(): number | null {
    if (this.activeNotes >= CAPACITY) return null;
    const addedIndex = this.activeNotes;
    this.noteMeshes[addedIndex].visible = true;
    this.activeNotes += 1;
    return addedIndex;
  }

  setActiveNotes(count: number): void {
    const nextCount = Math.max(0, Math.min(CAPACITY, Math.floor(count)));
    this.activeNotes = nextCount;
    this.noteMeshes.forEach((mesh, index) => {
      mesh.visible = index < nextCount;
    });
  }

  reset(): void {
    this.setActiveNotes(0);
  }

  isAddButton(object: object | null): boolean {
    return object === this.addNoteButton;
  }

  getState(): NotesManagerState {
    return {
      kind: "notes-manager-3d-block",
      loadStatus: this.loadStatus,
      activeNotes: this.activeNotes,
      capacity: 50,
      nextNoteIndex: this.activeNotes < CAPACITY ? this.activeNotes : null,
      addButtonPosition: tuple(this.addNoteButton.position),
      activeNotePositions: this.noteMeshes.slice(0, this.activeNotes).map((mesh) => tuple(mesh.position)),
      fullGuiRecoverable: false
    };
  }

  dispose(): void {
    const noteGeometry = this.noteMeshes[0]?.geometry;
    noteGeometry?.dispose();
    this.addNoteButton.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
    this.group.clear();
  }
}

