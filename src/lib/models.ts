import { nanoid } from 'nanoid'

// Imported 3D models (Blender exports) are large, so they live in this browser's IndexedDB,
// not inside the project. The project only keeps a key, size and placement.
const DB = 'unifest-models'
const STORE = 'files'

export interface ModelFile {
  id: string
  name: string
  size: number
  type: 'glb' | 'gltf' | 'obj' | 'fbx' | 'stl'
  data: ArrayBuffer
  added: number
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((res, rej) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE))
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export const MODEL_TYPES = ['glb', 'gltf', 'obj', 'fbx', 'stl'] as const
export const MAX_MODEL_MB = 150

export function modelType(name: string): ModelFile['type'] | null {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return (MODEL_TYPES as readonly string[]).includes(ext) ? (ext as ModelFile['type']) : null
}

export async function saveModel(f: File): Promise<ModelFile> {
  const type = modelType(f.name)
  if (!type) throw new Error('Use a .glb, .gltf, .obj, .fbx or .stl file. In Blender: File → Export → glTF 2.0 (.glb).')
  if (f.size > MAX_MODEL_MB * 1024 * 1024) throw new Error(`That file is over ${MAX_MODEL_MB} MB. In Blender, apply a Decimate modifier or export with Draco compression.`)
  const m: ModelFile = { id: nanoid(10), name: f.name, size: f.size, type, data: await f.arrayBuffer(), added: Date.now() }
  await tx('readwrite', (s) => s.put(m))
  return m
}

export const getModel = (id: string) => tx<ModelFile | undefined>('readonly', (s) => s.get(id))
export const deleteModel = (id: string) => tx('readwrite', (s) => s.delete(id))
export const listModels = () => tx<ModelFile[]>('readonly', (s) => s.getAll())
