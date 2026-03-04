import {
  AstNodeDescription,
  AstNodeDescriptionProvider,
  AstUtils,
  DefaultScopeProvider,
  //LangiumCoreServices,
  MapScope,
  ReferenceInfo,
  Scope,
  URI,
  //DefaultIndexManager,
  Stream,
  stream,
  AstNode,
  DocumentCache,
} from 'langium';
import {
  Decl,
  FileImport,
  Func,
  isFunc,
  isFuncCall,
  isLval,
  isProgram
} from '../generated/ast.js';
import { dirname, posix } from 'path';
import { MiniProbServices } from '../mini-prob-module.js';
// ScopeOptions AstNodeDescription

export class MiniProbScopeProvider extends DefaultScopeProvider {
  private astNodeDescriptionProvider: AstNodeDescriptionProvider;
  private readonly descriptionCache: DocumentCache<string, Scope>;
  constructor(services: MiniProbServices) {
    super(services);
    //get some helper services
    this.astNodeDescriptionProvider = services.workspace.AstNodeDescriptionProvider;
    this.descriptionCache = new DocumentCache(services.shared);
  }
  override getScope(context: ReferenceInfo): Scope {
    const container = context.container;
    if (context.property === 'ref' && container) {
      const program = AstUtils.getContainerOfType(container, isProgram)!;
      // filter Func for body -> only real Func and not ghost Reference(=current input)
      const programFunctions = program.functions.filter(this.isRealFunc);
      const includeFileImports = program.fileImports && program.fileImports.length > 0;

      let importedDescriptions: Stream<AstNodeDescription> = stream();
      if (isFuncCall(container)) {
        const descriptions = this.descriptionCache
          .get(
            AstUtils.getDocument(container).uri,
            Func,
            () =>
              new MapScope(
                programFunctions.map((func) =>
                  this.astNodeDescriptionProvider.createDescription(func, func.name)
                )
              )
          )
          .getAllElements();

        //include local Declarations for code-completion
        //const ghostFunc = AstUtils.getContainerOfType(container, isFunc); //isFunc this gets me the ghost reference node
        //You’re running into the “ghost” functions because Langium’s default scope provider will happily invent a placeholder Func for every unresolved identifier—so when you do

        //include declarations from first unclosed function(missing '}'), generally the one in which input is happening(quality of live).
        const enclosingUnfinishedFunc = programFunctions.find((func) => {
          const text = func.$cstNode?.text ?? '';
          const opens = (text.match(/{/g) || []).length;
          const closes = (text.match(/}/g) || []).length;
          return closes < opens;
        });
        let localDeclarationsDescriptions: AstNodeDescription[] = [];
        if (enclosingUnfinishedFunc) {
          localDeclarationsDescriptions = enclosingUnfinishedFunc.declarations.flatMap((decl) =>
            decl.names.map((n) => this.astNodeDescriptionProvider.createDescription(decl, n))
          );
        }

        //check for imported functions
        if (includeFileImports) {
          const document = AstUtils.getDocument(container);
          const uri = document.uri;
          importedDescriptions = this.getImportedScope(program.fileImports, uri, Func);
        }

        return new MapScope(
          stream(descriptions, importedDescriptions, localDeclarationsDescriptions)
        );
      } else if (isLval(container)) {
        const document = AstUtils.getDocument(container);

        const enclosingFunction = AstUtils.getContainerOfType(container, isFunc);
        if (enclosingFunction) {
          const programDeclarations = program.declarations || [];
          const descriptions = this.descriptionCache
            .get(
              document.uri,
              Decl,
              () =>
                new MapScope(
                  programDeclarations.flatMap((decl) =>
                    decl.names.map((name) =>
                      this.astNodeDescriptionProvider.createDescription(decl, name)
                    )
                  )
                )
            )
            .getAllElements();

          const localDeclarations = enclosingFunction.declarations || [];
          const localDescriptions = [...localDeclarations].flatMap((decl) =>
            decl.names.map((name) => this.astNodeDescriptionProvider.createDescription(decl, name))
          );

          // check for referenced function parameters
          const localFunctionParameter = enclosingFunction.params?.parameters;
          if (localFunctionParameter) {
            localDescriptions.push(
              ...localFunctionParameter.map((p) =>
                this.astNodeDescriptionProvider.createDescription(p, p.name)
              )
            );
          }

          //check for imported declarations          
          if (includeFileImports) {
            const document = AstUtils.getDocument(container);
            const uri = document.uri;
            importedDescriptions = this.getImportedScope(program.fileImports, uri, Decl);
          }
          return new MapScope(stream(descriptions, localDescriptions, importedDescriptions));
        } else {
          // usage of Lval(assignments or epxressions) outside of functions: currently not possible by the grammar
          const programDeclarations = program.declarations || [];
          const descriptions = this.descriptionCache
            .get(
              document.uri,
              Decl,
              () =>
                new MapScope(
                  programDeclarations.flatMap((decl) =>
                    decl.names.map((name) =>
                      this.astNodeDescriptionProvider.createDescription(decl, name)
                    )
                  )
                )
            )
            .getAllElements();
          return new MapScope(descriptions);
        }
      }
    }

    return super.getScope(context);
  }

  // only works for imports which are already parsed at elast once (globalScope is cached)
  private getImportedScope(
    fileImports: FileImport[],
    currentUri: URI,
    targetNodeType: string
  ): Stream<AstNodeDescription> {
    const importUris = fileImports.map((f) => {
      const filePath = posix.join(dirname(currentUri.path), f.file);
      return currentUri.with({ path: filePath }).toString();
    });
    // TODO make sure each uri's document is parsed at least once otherwise they are not indexed and not found

    const importKey = 'imported-';
    if (targetNodeType === Func) {
      const importedFuncDescriptions = this.descriptionCache.get(
        currentUri,
        importKey + targetNodeType,
        () => new MapScope(this.indexManager.allElements(Func, new Set<string>(importUris)))
      );
      return importedFuncDescriptions.getAllElements();
    } else if (targetNodeType === Decl) {
      const temp = this.indexManager.allElements(Decl, new Set<string>(importUris));
      const importedDeclDescriptions = this.descriptionCache.get(
        currentUri,
        importKey + targetNodeType,
        () => new MapScope(temp)
      ); //no extra filter necessary ?
      return importedDeclDescriptions.getAllElements();
    }

    return stream();
  }

  //helper functions
  private isRealFunc(node: AstNode | undefined): node is Func {
    return isFunc(node) && (node as Func).body !== undefined;
  }
}
