import Serverless from "serverless";
import fs from "fs";
import _ from "lodash";
import { Format, DefinitionType, DefinitionConfig, ServerlessFunctionConfig } from "./types";
import { DefinitionGenerator } from "./DefinitionGenerator";
import * as yaml from 'js-yaml';

const validator = require('oas-validator');
const { log } = require('@serverless/utils/log');

class ServerlessOpenAPIDocumentation {
    serverless: Serverless;
    options: any;
    commands: {};
    hooks: { [key: string]: Function }

    constructor(serverless: Serverless, cliOptions: any) {
        this.options = cliOptions;
        this.serverless = serverless;

        if (
            this.serverless.configSchemaHandler
        ) {
            this.serverless.configSchemaHandler.defineFunctionProperties('documentation', {
                properties: {
                    documentation: {
                        type: 'object',
                    },
                },
            });
        }

        this.commands = {
            openapi: {
                usage: "Generate OpenAPI v3 Documentation",
                lifecycleEvents: ["serverless"],
                options: {
                    output: {
                        usage: "Output file location [default: openapi.yml|json]",
                        shortcut: "o",
                        required: false,
                    },
                    format: {
                        usage: "OpenAPI file format (yml|json) [default: yml]",
                        shortcut: "f",
                        required: false,
                    },
                    indent: {
                        usage: "File indentation in spaces [default: 2]",
                        shortcut: "i",
                        required: false,
                    }
                }
            }
        };

        this.hooks = {
            "openapi:serverless": this.generate.bind(this),
        };
    }


    public async generate() {
        const service = this.serverless.service;
        log(("OpenAPI v3 Documentation Generator\n\n"));
        // Instantiate DocumentGenerator
        const generator = new DefinitionGenerator(
            service.custom['documentation'] as DefinitionConfig,
        );

        await generator.parse();

        // Map function configurations
        const funcConfigs = service.getAllFunctions()
            .map(functionName => {
                const func = service.getFunction(functionName);
                return _.merge({ _functionName: functionName }, func);
            });

        // Add Paths to OpenAPI Output from Function Configuration
        generator.readFunctions(funcConfigs as ServerlessFunctionConfig[]);

        // Process CLI Input options
        const config = this.processCliInput();

        const { definition } = generator;

        await this.validate(definition);

        // Output the OpenAPI document to the correct format
        const output = config.format.toLowerCase() === "yaml" ?
            yaml.dump(definition, { indent: config.indent }) :
            JSON.stringify(definition, null, config.indent);

        fs.writeFileSync(config.file, output);

        log(`${"[OUTPUT]"} To "${config.file}"\n`);
    }

    /**
     * Processes CLI input by reading the input from serverless
     * @returns config IConfigType
     */
    private processCliInput(): DefinitionType {
        const config: DefinitionType = {
            format: Format.yaml,
            file: "openapi.yml",
            indent: 2
        };

        config.indent = this.options.indent || 2;
        config.format = this.options.format || Format.yaml;
        config.file =
            this.options.output ||
            (config.format === "yaml" ? "openapi.yml" : "openapi.json");

        if ([Format.yaml, Format.json].indexOf(config.format) < 0) {
            throw new Error(
                'Invalid Output Format Specified - must be one of "yaml" or "json"'
            );
        }

        log(
            `${("[OPTIONS]")}`,
            `format: "${(config.format)}",`,
            `output file: "${(config.file)}",`,
            `indentation: "${(String(config.indent))}"\n\n`
        );

        return config;
    }

    public async validate(shema: any) {
        const options: any = {};

        log(
            `${(
                "[VALIDATION]"
            )} Validating OpenAPI generated output\n`
        );

        try {
            await validator.validate(shema, options)
            log(
                `${("[VALIDATION]")} OpenAPI valid: ${(
                    "true"
                )}\n\n`
            );
        } catch (error) {
            log(
                `${(
                    "[VALIDATION]"
                )} Failed to validate OpenAPI document: \n\n`
            );
            log(
                `${("Context:")} ${JSON.stringify(
                    options.context,
                    null,
                    2
                )}\n`
            );

            if (typeof options.error === "string") {
                log(`${options.error}\n\n`);
            } else if (options.error) {
                for (const info of options.error) {
                    log(("\n\n--------\n\n"));
                    log(" ", (info.dataPath), "\n");
                    log(" ", info.schemaPath, (info.message));
                    log(("\n\n--------\n\n"));
                }
            }
        }
    }
}

module.exports = ServerlessOpenAPIDocumentation;
