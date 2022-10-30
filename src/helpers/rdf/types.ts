import * as rdf from "rdflib"
import * as ns from "./ns"
import { Memoize } from "typescript-memoize"
import { atom, DefaultValue, AtomEffect, RecoilState } from "recoil"
import { nanoid } from "nanoid"
import { shInversePath } from "./ns"
import { debug as debugfactory } from "debug"

const debug = debugfactory("rde:rdf:types")

const defaultGraphNode = new rdf.NamedNode(rdf.Store.defaultGraphURI)

export const errors: Record<string, Record<string, boolean>> = {}

// global variable, should be in config?
export const history: Record<string, Array<Record<string, any>>> = {}

export enum ObjectType {
  Literal,
  Internal,
  ResInList,
  ResExt,
  ResIgnore,
  LitInList,
}

export const updateHistory = (
  entity: string,
  qname: string,
  prop: string,
  val: Array<Value>,
  noHisto: boolean | number = true
) => {
  if (!history[entity]) history[entity] = []
  else {
    while (history[entity].length && history[entity][history[entity].length - 1]["tmp:undone"]) {
      history[entity].pop()
    }
  }
  const newVal = {
    [qname]: { [prop]: val },
    ...entity != qname ? { "tmp:parentPath": getParentPath(entity, qname) } : {},
  }

  // don't add empty value to history (fix adding undo steps when showing secondary properties in Person/Kinship)
  if (val.length === 1 && !(val[0] instanceof LiteralWithId) && val[0].uri === "tmp:uri" || val[0].value === "")
    return

  // some value modifications must not be added to history (some autocreation of empty values for example)
  if (noHisto === -1) {
    const first = history[entity].findIndex((h) => h["tmp:allValuesLoaded"])
    if (first > 0) history[entity].splice(first, 0, newVal)
    else history[entity].push(newVal)
  } else history[entity].push(newVal)

  //debug("history:", entity, qname, prop, val, history, noHisto)
}

export type HistoryStatus = {
  top?: number
  first?: number
  current?: number
}

// get info from history (values modified? values undone?)
export const getHistoryStatus = (entityUri: string): HistoryStatus => {
  if (!history[entityUri]) return {}

  // DONE: optimizing a bit (1 for instead of 2 .findIndex + 1 .some)
  const top = history[entityUri].length - 1
  let first = -1,
    current = -1
  for (const [i, h] of history[entityUri].entries()) {
    if (h["tmp:allValuesLoaded"]) first = i
    else if (h["tmp:undone"]) current = i - 1
    if (first != -1 && current != -1) break
  }
  return { top, first, current }
}

export function getParentPath(entityUri: string, sub: string) {
  let parentPath: Array<string> = []
  // manually check which property has this subnode as value
  for (const h of history[entityUri]) {
    const subSubj = Object.keys(h).filter((k) => !["tmp:parent", "tmp:undone"].includes(k))
    for (const s of subSubj) {
      const subprop = Object.keys(h[s]).filter((k) => !["tmp:parent", "tmp:undone"].includes(k))
      for (const p of subprop) {
        if (typeof h[s][p] !== "string")
          for (const v of h[s][p]) {
            if (v instanceof Subject && v.uri === sub) {
              if (parentPath.length > 1 && parentPath[1] !== p)
                throw new Error("multiple property (" + parentPath + "," + p + ") for node " + sub)
              if (s !== entityUri) parentPath = getParentPath(entityUri, s)
              parentPath.push(s)
              parentPath.push(p)
            }
          }
      }
    }
  }
  return parentPath
}

export const rdfLitAsNumber = (lit: rdf.Literal): number | null => {
  const n = Number(lit.value)
  if (!isNaN(n)) {
    return +n
  }
  return null
}

export class Path {
  sparqlString: string

  directPathNode: rdf.NamedNode | null = null
  inversePathNode: rdf.NamedNode | null = null

  constructor(node: rdf.NamedNode, graph: EntityGraph, listMode: boolean) {
    const invpaths = graph.store.each(node, shInversePath, null) as Array<rdf.NamedNode>
    if (invpaths.length > 1) {
      throw "too many inverse path in shacl path:" + invpaths
    }
    if (invpaths.length == 1) {
      const invpath = invpaths[0]
      this.sparqlString = "^" + invpath.value
      this.inversePathNode = invpath
    } else {
      // if this is a list we add "[]" at the end
      if (listMode) {
        this.sparqlString = node.value + "[]"
      } else {
        this.sparqlString = node.value
      }
      this.directPathNode = node as rdf.NamedNode
    }
  }
}

// an EntityGraphValues represents the global state of an entity we're editing, in a javascript object (and not an RDF store)
export class EntityGraphValues {
  oldSubjectProps: Record<string, Record<string, Array<Value>>> = {}
  newSubjectProps: Record<string, Record<string, Array<Value>>> = {}
  subjectUri = ""
  /* eslint-disable no-magic-numbers */
  idHash = Date.now() //getRandomIntInclusive(1000, 9999).toString()
  noHisto: boolean | number = false

  constructor(subjectUri: string) {
    this.subjectUri = subjectUri
  }

}

type setSelfOnSelf = {
  setSelf: (arg: any) => void
  onSet: (newValues: (arg: Array<Value> | DefaultValue) => void) => void
}

// a proxy to an EntityGraph that updates the entity graph but is purely read-only, so that React is happy
export class EntityGraph {

  getValues: () => EntityGraphValues

  get values(): EntityGraphValues {
    return this.getValues()
  }

  // where to start when reconstructing the tree
  topSubjectUri: string
  store: rdf.Store
  // connexGraph is the store that contains the labels of associated resources
  // (ex: students, teachers, etc.), it's not present in all circumstances
  connexGraph?: rdf.Store
  prefixMap: ns.PrefixMap
  labelProperties: Array<rdf.NamedNode>
  descriptionProperties: Array<rdf.NamedNode>

  constructor(
    store: rdf.Store,
    topSubjectUri: string,
    prefixMap = ns.defaultPrefixMap,
    connexGraph: rdf.Store = rdf.graph(),
    labelProperties = ns.defaultLabelProperties,
    descriptionProperties = ns.defaultDescriptionProperties
  ) {
    this.store = store
    this.prefixMap = prefixMap
    this.descriptionProperties = descriptionProperties
    this.labelProperties = labelProperties
    // strange code: we're keeping values in the closure so that when the object freezes
    // the freeze doesn't proagate to it
    const values = new EntityGraphValues(topSubjectUri)
    this.topSubjectUri = topSubjectUri
    this.connexGraph = connexGraph
    this.getValues = () => {
      return values
    }
  }
}

export class RDFResource {
  node: rdf.NamedNode | rdf.BlankNode | rdf.Collection
  graph: EntityGraph
  isCollection: boolean

  constructor(node: rdf.NamedNode | rdf.BlankNode | rdf.Collection, graph: EntityGraph) {
    this.node = node
    this.graph = graph
    this.isCollection = node instanceof rdf.Collection
  }

  public get id(): string {
    return this.node.value
  }

  public get value(): string {
    return this.node.value
  }

  public get lname(): string {
    return this.graph.prefixMap.lnameFromUri(this.node.value)
  }

  public get namespace(): string {
    return this.graph.prefixMap.namespaceFromUri(this.node.value)
  }

  public get qname(): string {
    return this.graph.prefixMap.qnameFromUri(this.node.value)
  }

  public get uri(): string {
    return this.node.value
  }

}

export class RDFResourceWithLabel extends RDFResource {
  node: rdf.NamedNode

  constructor(node: rdf.NamedNode, graph: EntityGraph, labelProp?: rdf.NamedNode) {
    super(node, graph)
    this.node = node
  }

}

export class LiteralWithId extends rdf.Literal {
  id: string

  constructor(value: string, language?: string | null, datatype?: rdf.NamedNode, id?: string) {
    super(value, language, datatype)
    if (id) {
      this.id = id
    } else {
      this.id = nanoid()
    }
  }
}

export type Value = Subject | LiteralWithId | RDFResourceWithLabel

export class Subject extends RDFResource {
  node: rdf.NamedNode

  constructor(node: rdf.NamedNode, graph: EntityGraph) {
    super(node, graph)
    this.node = node
  }
}
