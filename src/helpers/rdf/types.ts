import * as rdf from "rdflib"
import { Memoize } from "typescript-memoize"
import { atom, DefaultValue, AtomEffect, RecoilState } from "recoil"
import { nanoid } from "nanoid"
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


export class Path {
  sparqlString: string | null = null

  directPathNode: rdf.NamedNode | null = null
  inversePathNode: rdf.NamedNode | null = null

  constructor(node: rdf.NamedNode, graph: EntityGraph, listMode: boolean) {
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

  constructor(
    store: rdf.Store,
    topSubjectUri: string,
    connexGraph: rdf.Store = rdf.graph(),
  ) {
    this.store = store
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
