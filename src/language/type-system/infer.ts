import { AstNode } from 'langium';
import {
  BinaryExpression,
  ProbabilisticAssignment,
  Lval,
  Distribution,
  isIntLiteral,
  isBoolLiteral,
  isLval,
  isLogicalNegation,
  isBinaryExpression,
  isDistribution,
  isProbabilisticAssignment,
  isType,
  Type,
  isParam,
  isIntType,
  isIntArray,
} from '../generated/ast.js';
import {
  IntegerTypeDescription,
  TypeDescription,
  createArrayType,
  createBooleanType,
  createErrorType,
  createIntegerType,
  isIntegerType,
  typeToString,
} from './description.js';

export function inferType(
  node: AstNode | undefined,
  cache: Map<AstNode, TypeDescription>
): TypeDescription {
  let type: TypeDescription | undefined;
  if (!node) {
    return createErrorType('Could not infer type for undefined', node);
  }
  const existing = cache.get(node);
  if (existing) {
    return existing;
  }
  // Prevent recursive inference errors
  cache.set(node, createErrorType('Recursive definition', node));

  if (isBoolLiteral(node)) {
    type = createBooleanType(node);
  } else if (isIntLiteral(node)) {
    //check for inner conflicts
    if (node.literal.value === undefined) {
      return createErrorType(`Incomplete integer literal`, node);
    }
    if (node.literal.sign === '-' && node.literal.suffix && node.literal.suffix[0] !== 's') {
      return createErrorType('Negatives value cannot be stored in unsigned integer', node);
    }

    try {
      if (node.literal.suffix) {
        var interpetedSuffix = parseTag(node.literal.suffix);
      } else {
        var interpetedSuffix = {
          signed: node.literal.sign === '-',
          width: Math.floor(Math.max(1, Math.log2(node.literal.value))) + 1 + Number(node.literal.sign === '-'),
        }
      }
      
      if (interpetedSuffix.width >> 29 !== 0) {
        type = createErrorType('The width of integers can only be up to (2^29)-1');
      } else if (node.literal.value >= Math.pow(2, interpetedSuffix.width)) {
        type = createErrorType(
          `Value ${node.literal.value} does not fit into integer with width ${interpetedSuffix.width}`,
          node
        );
      } else {
        type = createIntegerType(interpetedSuffix.width, interpetedSuffix.signed, node);
      }
    } catch (err) {
      if (err instanceof Error) {
        type = createErrorType(`Could not infer type for ${node.$type}: ${err.message}`, node);
      }
    }
  } else if (isLval(node)) {
    // maybe check for already exisitng parser error to avoid unnecessary stacking error messages
    type = inferLvalReference(node, cache);
  } else if (isLogicalNegation(node)) {
    type = createBooleanType();
  } else if (isBinaryExpression(node)) {
    type = inferBinaryExpression(node, cache);
  } else if (isDistribution(node)) {
    type = inferDistribution(node, cache);
  } else if (isProbabilisticAssignment(node)) {
    type = inferProbabilisticAssignment(node, cache);
  } else if (isParam(node)) {
    type = inferFromType(node.type, false, node);
  }

  if (!type) {
    type = createErrorType('Could not infer type for ' + node.$type, node);
  }

  cache.set(node, type);
  return type;
}

function inferLvalReference(lval: Lval, cache: Map<AstNode, TypeDescription>): TypeDescription {
  var referencedNode = lval.ref.ref;
  if (!referencedNode) {
    return createErrorType('Missing linked reference', lval);
  }

  if (isType(referencedNode.type)) {
    return inferFromType(referencedNode.type, lval.index !== undefined, lval);
  }

  return createErrorType('Unknown reference from LeftValue(Lval).', lval);
}

function inferBinaryExpression(
  expr: BinaryExpression,
  cache: Map<AstNode, TypeDescription>
): TypeDescription {
  if (['-', '*', '/', '%', '+'].includes(expr.operator)) {
    const left = inferType(expr.left, cache);
    const right = inferType(expr.right, cache);
    if (isIntegerType(left) && isIntegerType(right)) {
      if (expr.operator === '/' && right.literal?.literal.value === 0) {
        return createErrorType('Division by 0 not possible', expr);
      }

      var resultingWidth = 0;
      if (expr.operator === '%') {
        resultingWidth = (left.signed ? left.width - 1 : left.width) <= (right.signed ? right.width - 1 : right.width)
          ? left.width
          : right.width;
      } else {
        resultingWidth =
        (left.signed ? left.width - 1 : left.width) > (right.signed ? right.width - 1 : right.width)
          ? left.width
          : right.width;
      }      
      return createIntegerType(resultingWidth, left.signed || right.signed);
    } else {
      return createErrorType('Could not infer type due to inadequate members.', expr);
    }
  } else if (['&&', '||', '<', '<=', '>', '>=', '==', '!='].includes(expr.operator)) {
    return createBooleanType();
  }
  return createErrorType('Could not infer type from binary expression - unknown operator', expr);
}

function inferDistribution(
  distribution: Distribution,
  cache: Map<AstNode, TypeDescription>
): TypeDescription {
  // var args = [];
  // if (distribution.name === 'Uniform') {
  //     args.push(inferType(distribution.lower, cache));
  //     args.push(inferType(distribution.upper, cache));
  // } else if (distribution.name === 'Bernoulli') {
  //     args.push(inferType(distribution.p, cache));
  //     args.push(inferType(distribution.q, cache));
  // }
  //return createDistributionType(args, distribution);

  var paramType;
  switch (distribution.name) {
    case 'Bernoulli':
      return createIntegerType(1, false);
    case 'Uniform':
      paramType = inferType(distribution.upper, cache);

      if (isIntegerType(paramType)) {
        return createIntegerType(paramType.width, paramType.signed);
      }
      return createErrorType(
        'Unable to wholly infer type due to conflicting or missing upper limit',
        distribution
      );
  }
}

function inferProbabilisticAssignment(
  assignment: ProbabilisticAssignment,
  cache: Map<AstNode, TypeDescription>
): TypeDescription {
  var head = inferType(assignment.head, cache);
  const fallbacks = [];
  for (const fallback of assignment.fallbacks) {
    fallbacks.push(inferType(fallback, cache));
  }

  if (!fallbacks.every((typeDesc) => typeDesc.$type === head.$type)) {
    return createErrorType(
      `Possible results do not fit expected type of '${typeToString(head)}'.`,
      assignment
    );
  }

  if (isIntegerType(head) && fallbacks.every((val) => isIntegerType(val))) {
    fallbacks.push(head);
    const castFallbacks = fallbacks as IntegerTypeDescription[];
    const maxWidth = castFallbacks.reduce((best, current) =>
      (current.signed ? current.width - 1 : current.width) >
      (best.signed ? best.width - 1 : best.width)
        ? current
        : best
    );
    return maxWidth;
  }

  return head;
}

//helper functions
/**
 * Given a “raw” AST‐type object (one of your IntType / IntArray / BoolType
 * descriptors), plus whether it's been indexed into, and the originating node
 * (for error‐reporting), return the appropriate internal TypeDescription.
 */
function inferFromType(type: Type, indexedAccess: boolean, node: AstNode): TypeDescription {
  if (isIntType(type)) {
    const { signed, width } = parseTag(type.prefix ?? '');
    if (isIntArray(type)) {
      if (!indexedAccess) return createArrayType(createIntegerType(width, signed));
    }
    return createIntegerType(width, signed);
  } else {
    return createBooleanType();
  }
}

function parseTag(input: string): { signed: boolean; width: number } {
  const prefix = input.charAt(0);

  if (prefix !== 'u' && prefix !== 's') {
    throw new Error(`Unexpected prefix "${prefix}"`);
  }
  // slice off the first char and parse the rest
  const value = parseInt(input.slice(1), 10);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid number in "${input}"`);
  }
  return { signed: prefix === 's', width: value };
}
