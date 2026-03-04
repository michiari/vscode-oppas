import {
  AstNode,
  AstUtils,
  type ValidationAcceptor,
  type ValidationChecks,
} from 'langium';
import {
  isLval,
  isProgram,
  isFunc,
  Lval,
  Decl,
  type MiniProbAstType,
  Func,
  FuncCall,
  ProbChoice,
  Assignment,
  Distribution,
  BinaryExpression,
  LogicalNegation,
  IntegerLiteral,
  Observation,
  Program,
} from '../generated/ast.js';
import type { MiniProbServices } from '../mini-prob-module.js';
import {
  IntegerTypeDescription,
  isBooleanType,
  isErrorType,
  isIntegerType,
  TypeDescription,
  typeToString,
} from '../type-system/description.js';
import { inferType } from '../type-system/infer.js';
import { isCompatible } from '../type-system/compatible.js';
import { isLegalOperation } from '../type-system/operation.js';

/**
 * Register all custom validation routines with Langium’s ValidationRegistry.
 *
 * @param services   The injected MiniProbServices, which includes the validator and registry.
 */
export function registerValidationChecks(services: MiniProbServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.MiniProbValidator;
  const checks: ValidationChecks<MiniProbAstType> = {
    Lval: validator.checkArrayAccess,
    FuncCall: validator.checkFunctionCalls,
    Func: validator.checkFunctionDefinitions,
    Decl: validator.checkDeclarationIds,
    ProbChoice: validator.checkProbabilisticChoices,
    Assignment: validator.checkAssignments,
    Distribution: validator.checkDistributions,
    Observation: validator.checkObservationCondition,
    BinaryExpression: validator.checkBinaryExpressions,
    LogicalNegation: validator.checkUnaryExpressions,
    IntegerLiteral: validator.checkIntegerLiteral,
    Program: validator.checkOneFunction
  };
  registry.register(checks, validator);
}

/**
 * Core validator class implementing custom checks over the MiniProb AST.
 * Uses a shared cache to avoid recomputing type descriptions.
 */
export class MiniProbValidator {

  /**
   * Initialize the validator with language services.
   *
   * @param services   The MiniProbServices, providing caching and other helpers.
   */
  // eslint-disable-next-line
  constructor(services: MiniProbServices) {/*grab specific services here*/}

  /**
   * Ensure that any array‐style L-value index is an integer.
   *
   * - Infers the type of the index.
   * - If it’s an error type, reports that error.
   * - Otherwise, confirms it’s an integer, else reports incompatibility.
   *
   * @param node      The Lval node to validate.
   * @param accept    Callback to emit validation messages.
   */
  checkArrayAccess(node: Lval, accept: ValidationAcceptor) {
    if (node.index) {
      const map = this.getTypeCache();
      const indexType = inferType(node.index, map);
      if (isErrorType(indexType)) {
        accept('error', indexType.message, {
          node: indexType.source ?? node,
          property: 'index',
        });
        return;
      }
      if (!isIntegerType(indexType)) {
        accept('error', `Index type '${typeToString(indexType)}' not compatible with integer`, {
          node,
          property: 'index',
        });
      }
    }
  }

  /**
   * Validate assignments for type compatibility.
   *
   * - Infers left‐hand and right‐hand types (expression or distribution).
   * - If either side is an error type, reports it and skips compatibility.
   * - Otherwise, ensures the right side can be assigned to the left side.
   *
   * @param node      The Assignment AST node.
   * @param accept    Callback to emit validation messages.
   */
  checkAssignments(node: Assignment, accept: ValidationAcceptor) {
    var map = this.getTypeCache();
    const leftType = inferType(node.leftValue, map);
    var rightType;
    if (node.expression) {
      rightType = inferType(node.expression, map);
    } else {
      rightType = inferType(node.distribution, map);
    }

    var skipAssignErr = false;
    if (isErrorType(leftType)) {
      skipAssignErr = true;
      accept('error', leftType.message, {
        node: leftType.source ?? node,
      });
    }
    if (isErrorType(rightType)) {
      skipAssignErr = true;
      accept('error', rightType.message, {
        node: rightType.source ?? node,
      });
    }

    if (!skipAssignErr && !isCompatible(leftType, rightType)) {
      accept(
        'error',
        `Type ${typeToString(rightType)} is not assignable to ${typeToString(leftType)}.`,
        { node, property: 'expression' }
      );
    }
  }

  /**
   * Check function calls for correct argument count and types.
   *
   * - Verifies the number of actual arguments matches the function’s parameters.
   * - Infers each parameter and argument type.
   * - Reports errors for any mismatches or propagation errors.
   *
   * @param node      The FuncCall AST node.
   * @param accept    Callback to emit validation messages.
   */
  checkFunctionCalls(node: FuncCall, accept: ValidationAcceptor) {
    var refNode = node.ref.ref;
    if (refNode) {
      var noMatchParams = refNode.params?.parameters.length !== node.argumentList?.arguments.length;
      if (noMatchParams) {
        accept('error', 'Number of parameters does not match.', {
          node,
          property: 'argumentList',
        });
        return;
      }

      const map = this.getTypeCache();
      // arguments exist => parameter exist (with same length)
      if (node.argumentList) {
        const functionCallErrors = [];
        for (let i = 0; i < node.argumentList.arguments.length; i++) {
          let skipCompatibility = false;

          const argType = inferType(node.argumentList.arguments[i].expression, map);
          const paramType = inferType(refNode.params!.parameters[i], map);
          if (isErrorType(argType)) {
            functionCallErrors.push({
              node: node.argumentList!.arguments[i],
              message: `Conflicting argument: ${argType.message}`,
            });
            skipCompatibility = true;
          }
          if (isErrorType(paramType)) {
            functionCallErrors.push({
              node: refNode.params!.parameters[i],
              message: `Conflicting parameter: ${paramType.message}`,
            });
            skipCompatibility = true;
          }
          if (!skipCompatibility && !isCompatible(paramType, argType)) {
            functionCallErrors.push({
              node: node.argumentList!.arguments[i],
              message: `Argument type '${typeToString(argType)}' cannot be passed to '${typeToString(paramType)}'`,
            });
            skipCompatibility = true;
          }

          //value-result parameter have to be matched with references
          if (refNode.params!.parameters[i].byRef) {
            if (!isLval(node.argumentList.arguments[i].expression)) {
              functionCallErrors.push({
                node: node.argumentList.arguments[i],
                message: 'Value-result parameter expect named variables.',
              });
            }

            //value-result parameters enforce equivalence: argType <=> paramType
            if (!skipCompatibility && !isCompatible(argType, paramType)) {
              functionCallErrors.push({
                node: node.argumentList.arguments[i],
                message: 'Value-result parameter and argument types must match.',
              });
            }
          }
        }
        for (const error of functionCallErrors) {
          accept('error', error.message, { node: error.node });
        }
      }
    }
  }

  /**
   * Enforce uniqueness and rules for function definitions.
   *
   * - ‘main’ must not take any parameters.
   * - No two functions may share the same name within the same program.
   *
   * @param node      The Func AST node.
   * @param accept    Callback to emit validation messages.
   */
  checkFunctionDefinitions(node: Func, accept: ValidationAcceptor) {
    if (node.name === 'main' && node.params) {
      accept('error', "Function 'main' cannot have any arguments.", {
        node,
        property: 'params',
      });
    }

    const functionNames = AstUtils.getContainerOfType(node, isProgram)!
      .functions.filter((f) => f !== node) //filter out own-self
      .map((f) => f.name);

    if (functionNames.includes(node.name)) {
      accept('error', `Function with name ${node.name} already exists.`, {
        node,
        property: 'name',
      });
    }
  }

  /**
   * Ensure at least one function is defined in the program.
   * 
   * - At least one function must be defined in each program.
   *
   * @param node      The Program AST node.
   * @param accept    Callback to emit validation messages.
   */
  checkOneFunction(node: Program, accept: ValidationAcceptor) {
     if (node.functions.length === 0) {
      accept("error", 'At least one function must be defined in the program.', {
        node,
        property: "functions"
      });
     }
  }

  /**
   * Validate probabilistic choices (numerator : denominator).
   *
   * - Infers type of numerator and denominator.
   * - Ensures the ‘:’ operation is legal between those types.
   * - Checks against division by zero and enforces 0 ≤ value ≤ 1.
   *
   * @param node      The ProbChoice AST node.
   * @param accept    Callback to emit validation messages.
   */
  checkProbabilisticChoices(node: ProbChoice, accept: ValidationAcceptor) {
    const map = this.getTypeCache();
    const numerator = inferType(node.numerator, map);
    const denominator = inferType(node.denominator, map);

    let skipCompatibility = false;
    if (isErrorType(numerator)) {
      accept('error', numerator.message, { node, property: 'numerator' });
      skipCompatibility = true;
    }
    if (isErrorType(denominator)) {
      accept('error', denominator.message, { node, property: 'denominator' });
      skipCompatibility = true;
    }
    if (!skipCompatibility && !isLegalOperation(':', numerator, denominator)) {
      accept(
        'error',
        `This operation ':' is not possible with types '${typeToString(numerator)}' and '${typeToString(denominator)}'`,
        { node }
      );
      return;
    }

    const num = numerator as IntegerTypeDescription;
    const den = denominator as IntegerTypeDescription;
    if (den.literal?.literal.value === 0) {
      accept('error', 'Division by 0 not possible', { node });
      return;
    }
    if (
      num.signed ||
      den.signed ||
      (num.literal && den.literal && num.literal.literal.value > den.literal.literal.value)
    ) {
      accept('error', 'Probability value must be 0...1 and cannot be negative', { node });
    }
  }

  /**
   * Validate distribution constructors (Bernoulli, Uniform).
   *
   * - Ensures exactly two arguments are present.
   * - Internally builds a `params` array of { property: 'q'|'p'|'lower'|'upper'; expr }.
   * - First pass: capture any propagated errors.
   * - Second pass: if no errors, ensure each expr is an integer type.
   *
   * @param node      The Distribution AST node.
   * @param accept    Callback to emit validation messages.
   */
  checkDistributions(node: Distribution, accept: ValidationAcceptor) {
    if (
      (node.name === 'bernoulli' && (!node.q || !node.p)) ||
      (node.name === 'uniform' && (!node.upper || !node.lower))
    ) {
      accept('error', 'Distributions expect two arguments', { node });
      return;
    }
    const map = this.getTypeCache();

    let skipCompatibility = false;
    let params: Array<{ property: 'q' | 'p' | 'lower' | 'upper'; expr: AstNode | undefined }> = [];

    switch (node.name) {
      case 'bernoulli':
        params = [
          { property: 'p', expr: node.p },
          { property: 'q', expr: node.q },
        ];
        break;
      case 'uniform':
        params = [
          { property: 'lower', expr: node.lower },
          { property: 'upper', expr: node.upper },
        ];
        break;
      default:
        return;
    }

    for (const { expr } of params) {
      const ty = inferType(expr, map);
      if (isErrorType(ty)) {
        accept('error', ty.message, { node: ty.source ?? node });
        skipCompatibility = true;
      }
    }

    if (!skipCompatibility) {
      for (const { property, expr } of params) {
        const ty = inferType(expr, map);
        if (!isIntegerType(ty)) {
          accept('error', `Argument type '${typeToString(ty)}' not compatible with 'integer'`, {
            node,
            property,
          });
        }
      }
    }
  }

  /**
   * Validate binary expressions for operand compatibility.
   *
   * - Infers types of left and right operands.
   * - Reports any propagated error types.
   * - Ensures the given operator is legal on those types.
   *
   * @param node      The BinaryExpression AST node.
   * @param accept    Callback to emit validation messages.
   */
  checkBinaryExpressions(node: BinaryExpression, accept: ValidationAcceptor) {
    const map = this.getTypeCache();
    const leftType = inferType(node.left, map);
    const rightType = inferType(node.right, map);

    let skipCompatibility = false;
    if (isErrorType(leftType)) {
      accept('error', leftType.message, { node: leftType.source ?? node });
      skipCompatibility = true;
    }
    if (isErrorType(rightType)) {
      accept('error', rightType.message, { node: rightType.source ?? node });
      skipCompatibility = true;
    }

    if (!skipCompatibility && !isLegalOperation(node.operator, leftType, rightType)) {
      accept(
        'error',
        `The operation '${node.operator}' cannot be performed on types '${typeToString(leftType)}' and '${typeToString(rightType)}'`,
        { node }
      );
    }
  }

  /**
   * Validate logical negation expressions for a legal operand type.
   *
   * - Infers the operand’s type.
   * - Reports any propagated error.
   * - Ensures the '!' operator is legal on that type.
   *
   * @param node      The LogicalNegation AST node.
   * @param accept    Callback to emit validation messages.
   */
  checkUnaryExpressions(node: LogicalNegation, accept: ValidationAcceptor) {
    const map = this.getTypeCache();
    const operandType = inferType(node.operand, map);

    if (isErrorType(operandType)) {
      accept('error', operandType.message, { node: operandType.source ?? node });
      return;
    }
    if (!isLegalOperation(node.operator, operandType)) {
      accept(
        'error',
        `The operation '${node.operator}' is not possible on type '${typeToString(operandType)}'`,
        { node, property: 'operand' }
      );
    }
  }

  /**
   * Ensure integer literals contain no internal spaces.
   *
   * - Retrieves the CST token text.
   * - Uses regex to detect any spaces in the numeric literal.shadow
   *
   * @param node      The IntegerLiteral AST node.
   * @param accept    Callback to emit validation messages.
   */
  checkIntegerLiteral(node: IntegerLiteral, accept: ValidationAcceptor) {
    const cst = node.$cstNode;
    if (!cst) return;
    if (cst.length > 1 && /^(?![+-]?\d+([uUsS]\d+)?$).+/.test(cst.text)) {
      accept('error', 'No spaces are allowed in integer literals', { node });
    }
  }

  /**
   * Validate declaration statements to prevent duplicate identifiers.
   *
   * - Gathers all top‐level and local declarations in the same scope.
   * - Checks for duplicate names within this node’s own list.
   * - Ensures none of the names share existing declarations.
   *
   * @param node      The Decl AST node.
   * @param accept    Callback to emit validation messages.
   */
  checkDeclarationIds(node: Decl, accept: ValidationAcceptor) {
    const topLevelNames =
      AstUtils.getContainerOfType(node, isProgram)
        ?.declarations.filter((d) => d !== node)
        .flatMap((d) => d.names) ?? [];
    const localNames =
      AstUtils.getContainerOfType(node, isFunc)
        ?.declarations.filter((d) => d !== node)
        .flatMap((d) => d.names) ?? [];

    const { hasDup } = node.names.reduce(
      (acc, name, idx) => {
        if (acc.seen.has(name)) acc.hasDup = idx;
        else acc.seen.add(name);
        return acc;
      },
      { seen: new Set(), hasDup: -1 }
    );

    if (hasDup >= 0) {
      accept('error', 'Identifier is already declared here', {
        node,
        property: 'names',
        index: hasDup,
      });
    }

    const forbidden = new Set([...topLevelNames, ...localNames]);
    node.names.forEach((name, i) => {
      if (forbidden.has(name)) {
        accept('error', `Identifier '${name}' is already declared`, {
          node,
          property: 'names',
          index: i,
        });
      }
    });
  }

  checkObservationCondition(node: Observation, accept: ValidationAcceptor) {
    const map = this.getTypeCache();
    const conditionType = inferType(node.condition, map);
    if (!isBooleanType(conditionType)) {
      accept('error', 'Only boolean expressions can be observed', {
        node,
        property: 'condition',
      });
    }
  }

  /**
   * Create a fresh, empty cache for type inference to avoid cross-node pollution.
   *
   * @returns A new Map from AstNode to inferred TypeDescription.
   */
  private getTypeCache(): Map<AstNode, TypeDescription> {
    return new Map();
  }
}
