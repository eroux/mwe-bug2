import * as rdf from "rdflib"

export const defaultGraphNode = rdf.sym(rdf.Store.defaultGraphURI) as rdf.NamedNode
