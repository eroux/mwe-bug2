import * as rdf from "rdflib"
import {
  RDFResource,
  RDFResourceWithLabel,
  EntityGraph,
  Subject,
  rdfLitAsNumber,
  LiteralWithId,
  ObjectType,
  Path,
} from "./types"
import * as ns from "./ns"
import { Memoize } from "typescript-memoize"


export class PropertyShape extends RDFResourceWithLabel {
  constructor(node: rdf.NamedNode, graph: EntityGraph) {
    super(node, graph, ns.rdfsLabel)
  }
}


export class NodeShape extends RDFResourceWithLabel {
  constructor(node: rdf.NamedNode, graph: EntityGraph) {
    super(node, graph, ns.rdfsLabel)
  }
}
