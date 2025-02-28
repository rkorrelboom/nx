import { dirname, join } from 'path';

import { readPluginPackageJson } from '../../utils/nx-plugin';
import {
  CustomHasher,
  Executor,
  ExecutorConfig,
  ExecutorsJson,
  TaskGraphExecutor,
} from '../../config/misc-interfaces';
import { readJsonFile } from '../../utils/fileutils';
import {
  getImplementationFactory,
  resolveSchema,
} from '../../config/schema-utils';
import { getNxRequirePaths } from '../../utils/installation-directory';

export function normalizeExecutorSchema(
  schema: Partial<ExecutorConfig['schema']>
): ExecutorConfig['schema'] {
  const version = (schema.version ??= 1);
  return {
    version,
    outputCapture:
      schema.outputCapture ?? version < 2 ? 'direct-nodejs' : 'pipe',
    properties:
      !schema.properties || typeof schema.properties !== 'object'
        ? {}
        : schema.properties,
    ...schema,
  };
}

export function getExecutorInformation(
  nodeModule: string,
  executor: string,
  root: string
): ExecutorConfig & { isNgCompat: boolean; isNxExecutor: boolean } {
  try {
    const { executorsFilePath, executorConfig, isNgCompat } = readExecutorsJson(
      nodeModule,
      executor,
      root
    );
    const executorsDir = dirname(executorsFilePath);
    const schemaPath = resolveSchema(executorConfig.schema, executorsDir);
    const schema = normalizeExecutorSchema(readJsonFile(schemaPath));

    const implementationFactory = getImplementationFactory<Executor>(
      executorConfig.implementation,
      executorsDir
    );

    const batchImplementationFactory = executorConfig.batchImplementation
      ? getImplementationFactory<TaskGraphExecutor>(
          executorConfig.batchImplementation,
          executorsDir
        )
      : null;

    const hasherFactory = executorConfig.hasher
      ? getImplementationFactory<CustomHasher>(
          executorConfig.hasher,
          executorsDir
        )
      : null;

    return {
      schema,
      implementationFactory,
      batchImplementationFactory,
      hasherFactory,
      isNgCompat,
      isNxExecutor: !isNgCompat,
    };
  } catch (e) {
    throw new Error(
      `Unable to resolve ${nodeModule}:${executor}.\n${e.message}`
    );
  }
}

function readExecutorsJson(
  nodeModule: string,
  executor: string,
  root: string
): {
  executorsFilePath: string;
  executorConfig: {
    implementation: string;
    batchImplementation?: string;
    schema: string;
    hasher?: string;
  };
  isNgCompat: boolean;
} {
  const { json: packageJson, path: packageJsonPath } = readPluginPackageJson(
    nodeModule,
    root
      ? [root, __dirname, process.cwd(), ...getNxRequirePaths()]
      : [__dirname, process.cwd(), ...getNxRequirePaths()]
  );
  const executorsFile = packageJson.executors ?? packageJson.builders;

  if (!executorsFile) {
    throw new Error(
      `The "${nodeModule}" package does not support Nx executors.`
    );
  }

  const executorsFilePath = require.resolve(
    join(dirname(packageJsonPath), executorsFile)
  );
  const executorsJson = readJsonFile<ExecutorsJson>(executorsFilePath);
  const executorConfig: {
    implementation: string;
    batchImplementation?: string;
    schema: string;
    hasher?: string;
  } = executorsJson.executors?.[executor] || executorsJson.builders?.[executor];
  if (!executorConfig) {
    throw new Error(
      `Cannot find executor '${executor}' in ${executorsFilePath}.`
    );
  }
  const isNgCompat = !executorsJson.executors?.[executor];
  return { executorsFilePath, executorConfig, isNgCompat };
}
