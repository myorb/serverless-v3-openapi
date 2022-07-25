import { JSONSchema7 } from "json-schema";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import _ from "lodash";
import { Model } from "./types";
import toOpenApi from '@openapi-contrib/json-schema-to-openapi-schema';

function updateReferences(schema: JSONSchema7): JSONSchema7 {
  if (!schema) {
    return schema;
  }

  const cloned = _.cloneDeep(schema);

  if (cloned.$ref) {
    return {
      ...cloned,
      $ref: cloned.$ref.replace("#/definitions", "#/components/schemas")
    };
  }

  if (Array.isArray(cloned.type) && cloned.type.indexOf('null') > -1) {
    return { anyOf: cloned.type.map((t) => (t === 'null' ? { nullable: true } : { type: t })) };
  }

  // TODO: fix this
  for (const key of Object.getOwnPropertyNames(cloned)) {
    const value = cloned[key];

    if (typeof value === "object") {
      cloned[key] = updateReferences(value);
    }
  }

  return cloned;
}

export default async function parseModels(
  models: Array<Model>,
): Promise<{}> {


  const schemas = {};

  if (!_.isArrayLike(models)) {
    throw new Error("Empty models");
  }

  for (const model of models) {
    if (!model.schema) {
      continue;
    }

    const newSchema = await convertToOpenApi(model.schema);

    _.assign(schemas,
      { [model.name]: newSchema },
      updateReferences(newSchema.definitions),
    );
  }

  return schemas;
}

async function convertToOpenApi(input: JSONSchema7 | string): Promise<string | any> {
  const schema = await $RefParser.dereference(input)
  return await toOpenApi(schema)
}
