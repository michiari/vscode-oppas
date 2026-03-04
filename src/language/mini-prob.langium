grammar MiniProb

type DeclOrParam = Decl | Param;

entry Program:
    (fileImports+=FileImport)*
    probabilisticQuery=PROB_QUERY? // not tested: out of scope
    formula=FORMULA? // not tested: out of scope
    'program:'?
    (declarations+=Decl ';')* functions+=Func+;

FileImport:
    '#include' file=STRING;

Decl:
    type=Type names+=ID (',' names+=ID)*;

Func:
    name=ID '(' params=ParamList? ')' '{'
        (declarations+=Decl ';')*
        body=Block
    '}';
FuncCall:
    ref=[Func:ID] '(' argumentList=ArgList? ')';

Block:
    statements+=Stmt+;

Stmt:
    ( Assignment | Query | Observation | FuncCall | 'throw') ';' | IfThenElse | While | TryCatch;

Lval:
    ref=[DeclOrParam:ID] ('['index=Expression']')?;

IfThenElse:
    'if' '(' condition=Expression ')' '{' thenBlock=Block? '}' 'else' '{' elseBlock=Block? '}'; //empty possible! and else needed!
While:
    'while' '(' condition=Expression ')' '{' whileBlock=Block? '}';//empty while!
TryCatch:
    'try' '{' tryBlock=Block? '}' 'catch' '{' catchBlock=Block? '}';// empty catch and try!
Assignment:
    leftValue=Lval '=' (distribution=Distribution | expression=Expression); //probability assign now expression
Observation:
    'observe' condition=Expression; // no ()! implicit with expr
Query:
    'query' function=FuncCall;

ParamList:
    parameters+=Param (',' parameters+=Param)*;
Param:
    type=Type byRef?='&'? name=ID; //distributive?
ArgList:
    arguments+=Arg (',' arguments+=Arg)*;
Arg:
    expression=Expression; //only expre and no ref symbol

Distribution:
    (name='bernoulli' '(' p=Expression ',' q=Expression ')') |
    (name='uniform' '(' lower=Expression ',' upper=Expression ')');
ProbChoice:
    '{'numerator=Expression ':' denominator=Expression '}';

Expression:
    LogicalOr ({infer ProbabilisticAssignment.head=current} (probabilities+=(ProbChoice) fallbacks+=LogicalOr)+)?; // tmrrw
LogicalOr infers Expression:
    LogicalAnd ({infer BinaryExpression.left=current} operator='||' right=LogicalAnd)*;
LogicalAnd infers Expression:
    Comparison ({infer BinaryExpression.left=current} operator='&&' right=Comparison)*;
Comparison infers Expression:
    Term ({infer BinaryExpression.left=current} operator=('<' | '<=' | '>' | '>=' | '==' | '!=') right=Term)*;
Term infers Expression:
    Factor ({infer BinaryExpression.left=current} operator=('+' | '-') right=Factor)*;
Factor infers Expression:
    Division ({infer BinaryExpression.left=current} operator=('*') right=Division)*;
Division infers Expression:
    Unary ({infer BinaryExpression.left=current} operator=('/' | '%') right=Unary)*;
Unary infers Expression:
    ({infer LogicalNegation} operator=('!') operand=Unary) | Primary;
Primary infers Expression:
    {infer BoolLiteral} literal=BOOL | 
    {infer IntLiteral} literal=IntegerLiteral | //whitespace allowed fir intpreffix(catch in validation)
    Lval |
    '(' Expression ')';


Type:
    'bool' | IntType;

IntType:
  prefix=INT_PREFIX ({infer IntArray} '[' size=INT ']')?;
IntegerLiteral: // same name as infer IntLiteral creates minor conflicts
    sign=('+' | '-')? value=INT suffix=INT_PREFIX?;

terminal INT_PREFIX: /[su][1-9][0-9]{0,8}/; // 2^29-1 backend
terminal BOOL returns boolean: /(true|false)/;
terminal PROB_QUERY: /probabilistic query:.*;/;
terminal FORMULA: /formula\s?=\s?.*;/;
terminal ID: /(?!(true|false)|[su][1-9][0-9]*)[a-zA-Z_][a-zA-Z0-9_\.\:\~]*/;
terminal STRING returns string: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/; // returns string necessary od default?
terminal INT returns number: /[0-9]+/;
hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;