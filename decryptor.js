function writeJs(data, path) {
    path = path ? path : "out.js"
    fs.writeFileSync(path, data)
}

function readJs(path) {
    return fs.readFileSync(path).toString()
}

/**
 * 通过父级Key和当前属性值获取操作映射
 * @param operateMap 操作映射表
 * @param key 父级key
 * @param propertyValue 属性值
 */
function getOperateFromMap(operateMap, key, propertyValue) {
    return operateMap[key + "/" + JSON.stringify(propertyValue)]
}

/**
 * 通过父级Key和当前属性值设置操作映射
 * @param operateMap 操作映射表
 * @param key 父级key
 * @param propertyValue 属性值
 * @param type 类型
 */
function setOperateToMap(operateMap, key, propertyValue, type) {
    setAndCheck(operateMap, key + "/" + JSON.stringify(propertyValue), type)
}

/**
 * 评估函数节点是否是基础函数操作
 * @param key 父级var 名称
 * @param parentVariableMap 父级基础运算操作符函数映射{变量名+key:{type,value}}
 * @param functionNode 函数节点
 */
function isSimpleBaseOperateFunction(key, parentVariableMap, functionNode) {
    let body = functionNode.body
    if (body.type === "BlockStatement") {
        body = body.body
        if (body.length === 1 && body[0].type === "ReturnStatement") {
            body = body[0]
            let argument = body.argument
            if (argument) {
                if (argument.type === "Literal" || (argument.type === "Identifier" && argument.name === "undefined")) {
                    //函数模板
                    //function (_0x4a21e5, _0x13c4ce, _0x33dc72) {
                    //     return null;
                    // }
                    // 特殊情况
                    //function (_0xa7c34c, _0x1caf46) {
                    //     return undefined;
                    // }
                    return {
                        type: "字面量",
                        value: argument.value
                    }
                }
                if (argument.type === 'BinaryExpression' || argument.type === 'LogicalExpression') {
                    let params = functionNode.params
                    if (
                        params.length === 2 &&
                        argument.left.type === "Identifier" && argument.left.name === params[0].name &&
                        argument.right.type === "Identifier" && argument.right.name === params[1].name
                    ) {
                        return {
                            type: argument.type,
                            value: argument.operator
                        }
                    } else {
                        console.warn("意外的计算表达式：", functionNode)
                    }
                } else if (argument.type === "CallExpression") {
                    //函数表达式
                    // function (_0x98331e, _0xa3238) {
                    //     return _0x98331e == _0xa3238;
                    // }
                    let callee = argument.callee
                    if (callee.type === "MemberExpression") {
                        let property = callee.property
                        let object = callee.object
                        if (object.type === "Identifier" && property.type === "Literal") {
                            return getOperateFromMap(parentVariableMap, object.name, property.value)
                        }
                    } else if (callee.type === "Identifier") {
                        let params = functionNode.params
                        let names = new Set()
                        for (let name of params) {
                            names.add(name.name)
                        }
                        if (params[0].name === callee.name) {
                            if (params.length > 1) {
                                for (let arg of argument.arguments) {
                                    if (arg.type === "Identifier") {
                                        if (!names.has(arg.name)) {
                                            return
                                        }
                                    }
                                }
                            }
                            return {
                                type: "简单调用"
                            }
                        }
                    } else {
                        console.warn("不受支持的表达式:", escodegen.generate(functionNode))
                    }
                }
            } else if (body.left === undefined && body.right === undefined) {
                if (body.argument) {
                    return {
                        type: "字面量",
                        value: eval(body.argument.raw)
                    }
                } else {
                    return {
                        type: "字面量",
                        value: undefined
                    }
                }
            } else {
                console.warn("不受支持的表达式:", escodegen.generate(functionNode))
            }
        }
    }
}

function setAndCheck(o, k, v) {
    let cv = o[k]
    if (v && cv) {
        if (cv.type !== v.type || cv.value !== v.value) {
            console.warn("数据已经存在：", o[k], cv)
            throw new Error("数据已存在: " + k)
        }
    } else if (v) {
        o[k] = v
        return true
    }
    return false
}

/**
 * 取反操作解析
 * @param unaryExpressionNode
 * @return {boolean} 失败返回undefined
 */
function unaryExpressionComputed(unaryExpressionNode) {
    if (unaryExpressionNode.type === "UnaryExpression") {
        let res = unaryExpressionComputed(unaryExpressionNode.argument)
        if (res !== undefined) {
            return !res
        }
    }
    if (unaryExpressionNode.type === "ArrayExpression") {
        return true
    }
    if (unaryExpressionNode.type === "Literal") {
        return unaryExpressionNode.value
    }
    // console.log("不支持的UnaryExpression表达", escodegen.generate(unaryExpressionNode))
}

/**
 * 清除无效的分支判断语句
 */
function clearIfStatement(ifStatementNode, vmContext) {
    let test = ifStatementNode.test
    let v = undefined
    if (test.type === "BinaryExpression") {
        let testCode = escodegen.generate({
            "type": "CallExpression",
            "callee": {
                "type": "Identifier",
                "name": "Boolean"
            },
            "arguments": [test],
            "optional": false
        })
        try {
            v = virtualGlobalEval(vmContext, testCode)
        } catch (err) {
            console.warn("执行表达式失败：", escodegen.generate(test))
        }
    } else if (test.type === "Literal") {
        v = Boolean(test.value)
    }
    if (v !== undefined) {
        if (v) {
            return ifStatementNode.consequent
        } else {
            return ifStatementNode.alternate
        }
    }
}

/**
 * 检查并创建基础运算操作表对象是否只含有基础加密和字符常量, 并生成映射列表
 * @param parentVariableMap 父级基础运算操作符函数映射{变量名+key:{type,value}}
 * @param decryptVariableNode 基础运算操作符函数映射对象节点
 */
function buildOperateMapFromVariable(parentVariableMap, decryptVariableNode) {
    //判断变量是否只有一个
    if (decryptVariableNode.declarations && decryptVariableNode.declarations.length > 1) {
        let declarations = decryptVariableNode.declarations[1]
        let key = declarations.id.name
        // 判断定义的变量是否是Object类型
        if (declarations.init) {
            if (declarations.init.type === "ObjectExpression") {
                for (let property of declarations.init.properties) {
                    if (property.value.type === "Literal") {
                        setOperateToMap(parentVariableMap, key, property.key.value, {
                            value: property.value.value,
                            type: "字面量"
                        })
                    } else if (property.value.type === "FunctionExpression") {
                        let v = isSimpleBaseOperateFunction(key, parentVariableMap, property.value)
                        if (v) {
                            setOperateToMap(parentVariableMap, key, property.key.value, v)
                        } else {
                            console.clear();
                            console.warn("FunctionExpression 不受支持：", escodegen.generate(property))
                            console.log("node ===> ", property)
                        }
                    } else if (property.value.type === "MemberExpression") {
                        let ob = property.value.object
                        let pt = property.value.property
                        setOperateToMap(
                            parentVariableMap, key, property.key.value, getOperateFromMap(
                                parentVariableMap, ob.name, pt.value
                            )
                        )
                    } else if (property.value.type === "Identifier") {
                        setOperateToMap(parentVariableMap, key, property.key.value, {
                            type: "定义",
                            value: property.value
                        })
                    } else if (property.value.type === "UnaryExpression" && property.value.operator === "!") {
                        //处理!![]
                        let r = unaryExpressionComputed(property.value)
                        if (r !== undefined) {
                            setOperateToMap(parentVariableMap, key, property.key.value, {
                                type: '字面量',
                                value: r
                            })
                        }
                    } else {
                        console.warn("未判断，且不受支持：", key, " ---> ", escodegen.generate(property), property)
                    }
                }
            }
        }
    }
}

/**
 * 利用父级与子级节点的操作映射表差异清除无效的操作表映射变量
 * @param blockStatementNode
 * @param parentOperateMap
 * @param childOperateMap
 */
function clearUnavailableVariableFromOperateMap(blockStatementNode, parentOperateMap, childOperateMap) {
    let parentKeys = Object.keys(parentOperateMap)
    let childKeys = Object.keys(childOperateMap)
    if (parentKeys.length < childKeys.length) {
        let oldMap = new Set(parentKeys)
        let diffVarName = new Set()
        childKeys.filter(x => !oldMap.has(x)).forEach(x => diffVarName.add(x.split("/")[0]))
        estraverse.replace(blockStatementNode, {
            leave(node) {
                if (node.type === "VariableDeclaration" && diffVarName.has(node.declarations[0].id.name)) {
                    this.remove()
                }
            }
        })
    }
}

/**
 * 转换代码为AST
 * @param codeContext 代码
 * @returns {Node} AST数据
 */
function getAst(codeContext) {
    return acorn.parse(codeContext, {
        sourceType: 'script',
        location: false,
    })
}

/**
 * 使用VM　context执行
 * @param context
 * @param script
 * @returns {any}
 */
function virtualGlobalEval(context, script) {
    return vm.runInContext(script, context);
}

/**
 * 查找并加载解密函数
 * @param codeStr 源码
 * @returns {{code: Node, vmContext: Context, name}}
 */
function findStrEncryptionFunction(codeStr) {
    console.log("----------------------开始解析字符串解密函数----------------------")
    let ast = getAst(codeStr)
    writeJs(escodegen.generate(ast), "org.js");
    let program = ast.body
    
    program = program.filter(x => x.type !== "EmptyStatement")
    let decStrFuncName = "";
    let decStrFuncNameV2 = "";
    let decStrFuncDepNameV2 = "";
    let decFuncCodeBody = [];
    let decStrDepFuncName = "";
    let foundNode = false;
    let foundNodeV2 = false;
    let foundNodeV2Dep = false;
    for(let i=0; i < ast.body.length; i++) {
        let node = ast.body[i];
        if(!foundNode) {
            try {
                // 创建解密函数体
                decFuncCodeBody.push(node);
                // 解密依赖字符串生成函数
                decStrDepFuncName = node.expression.left.expressions[0].arguments[2].name;
                // 解密函数
                decStrFuncName = node.expression.left.expressions[0].callee.body.body[0].argument.expressions[3].callee.body.body[0].declarations[0].init.name;
                if(decStrDepFuncName && decStrFuncName) {
                    foundNode = true;
                }
            } catch(e) {
            }
        }
        if(!foundNodeV2) {
            try{
                if(node.type==="VariableDeclaration" && 
                    node.kind === "const" &&
                    node.declarations.length === 1 &&
                    node.declarations[0].init &&
                    node.declarations[0].init.type === "Identifier" &&
                    node.declarations[0].id.type === "Identifier"
                ) {
                      decStrFuncNameV2=node.declarations[0].init.name;
                      foundNodeV2 = true;
                }
            } catch(e) {}
        }
        if(!foundNodeV2Dep) {
            try{
                if(node.type === "FunctionDeclaration" && node.id.name === decStrFuncNameV2) {
                    if(node.body.body[0].declarations[2].type == "VariableDeclarator" &&
                    node.body.body[0].declarations[2].init.type == "CallExpression" &&
                    node.body.body[0].declarations[2].init.arguments[0].type == "Identifier"
                    ) {
                        decStrFuncDepNameV2=node.body.body[0].declarations[2].init.arguments[0].name;
                        if(decStrFuncDepNameV2) {
                            foundNodeV2Dep = true;
                        }
                    }
                }
            }catch(e){}
        }
    }
    if(!foundNode) {
        throw new Error("没有找到字符串加密函数！")
    }
    if(!foundNodeV2) {
        throw new Error("没有找到字符串加密函数V2！")
    }
    if(!foundNodeV2Dep) {
        throw new Error("没有找到字符串加密函数V2依赖函数！")
    }
    console.log("找到解密函数 ==> ", decStrFuncName, ", 找到解密依赖函数 ==> ", decStrDepFuncName);
    console.log("---------------------- 开始查找解密函数体 ----------------------")
    foundNode = 0;
    let encCode = [];
    ast.body.forEach(node=>{
        // 查找解密函数节点
        if(node.type === 'FunctionDeclaration') {
            if(node.id.name === decStrFuncName) {
                foundNode = foundNode | 1;
            } else if(node.id.name === decStrDepFuncName) {
                foundNode = foundNode | 2;
            } else if(node.id.name === decStrFuncNameV2) {
                foundNode = foundNode | 4;
            } else if(node.id.name === decStrFuncDepNameV2) {
                foundNode = foundNode | 8;
            } else {
                encCode.push(node);
                return;
            }
            // 防止重复添加
            if(!decFuncCodeBody.includes(node)) {
                decFuncCodeBody.push(node);
            }
            return
        } else if(!decFuncCodeBody.includes(node)) {
            encCode.push(node);
        }
    });
    let errors = [
        "没有找到解密函数节点！", 
        "没有找到解密函数依赖节点！", 
        "没有找到解密函数V2节点！", 
        "没有找到解密函数V2依赖节点！"
    ];
    for(let i=0; i < 4; i++) {
        if((1 << i) & foundNode == 0) {
            throw new Error(errors[i])    
        }
    }
    let decFuncAst = builders.program(decFuncCodeBody);
    let decFuncCode = escodegen.generate(decFuncAst);
    writeJs(decFuncCode, "decFuncCode.js");
    writeJs(escodegen.generate(builders.program(encCode)), "encCode.js");
    ast.body = encCode
    let vmContext = vm.createContext()
    if (config.vmInitScript) {
        virtualGlobalEval(vmContext, config.vmInitScript)
    }
    virtualGlobalEval(vmContext, decFuncCode);
    return [decStrFuncName, decStrFuncNameV2, ast, vmContext]
}

function checkAndGetNewDecName(node, names) {
    if(node.type === "VariableDeclarator"
        && node.init
        && names.has(node.init.name)
    ) {
        names.add(node.id.name)
        return true;
    }
    return false;
}

function evalDecryptStr(vmContext, node, name) {
    let oldName = node.callee.name;
    let code = "";
    try {
        node.callee.name = name;
        code = escodegen.generate(node)
        let result = virtualGlobalEval(vmContext, code)
        if (typeof result === 'string') {
            return builders.literal(result)
        }
    } catch (e) {
        console.warn("无评估代码片段：", code)
    }
    node.callee.name = oldName;
}

function clearEncryptStrCodeV2Handler(vmCtx, node, name, names) {
    if (node.type === "CallExpression"
        && node.callee
        && node.callee.type === "Identifier"
    ) {
        if(node.arguments.length == 1
            && node.arguments[0].type == "Literal") {
            if(names.has(node.callee.name)) {
                node = evalDecryptStr(vmCtx, node, name)
                if(node){
                    return node;
                }
            } else {
                console.log("V2解密不支持 ==> ", escodegen.generate(node))
            }
        }
    }
}

function clearEncryptStrCodeHandler(vmCtx, node, name, names) {
    if (node.type === "CallExpression"
        && node.callee
        && node.callee.type === "Identifier"
    ) {
        if(node.arguments.length == 2 
            && node.arguments[0].type == "Literal"
            && node.arguments[1].type == "Literal") {
            if(names.has(node.callee.name)) {
                return evalDecryptStr(vmCtx, node, name)
            } else {
                console.log("V1解密不支持 ===> ", escodegen.generate(node))
            }
        }
    }
}

function clearEncryptStrCodeWalker(ast, evalFunc, namesStack) {
    let count = 0;
    ast = estraverse.replace(ast, {
        enter(node){
            if (node.type === "BlockStatement") {
                // 记录局部变量作用域堆栈
                let currentName = new Set(namesStack[namesStack.length -1]);
                namesStack.push(currentName);
            } else if(node.type === "VariableDeclarator") {
                // 处理解密函数映射（不能删除变量定义，防止操作过程加密，而无法追踪解密）
                checkAndGetNewDecName(node, namesStack[namesStack.length-1]);
            }
            return node;
        },
        leave(node){
            if (node.type === "BlockStatement") {
                namesStack.pop();
            } else if(node.type === "VariableDeclaration" && node.declarations.length == 0) {
                return estraverse.VisitorOption.Remove;
            } else {
                let newNode = evalFunc(node, namesStack[namesStack.length-1]);
                if(newNode) {
                    count++;
                    return newNode;
                } 
            }
            return node;
        }
    });
    return [ast, count];
}

/**
 * 操作一,清除加密字符串
 * @returns {{ast, vmContext: Context}} 解密后的AST节点
 */
function clearEncryptStrCode(codeStr) {
    let [decStrFuncName, decStrFuncNameV2, ast, vmContext] = findStrEncryptionFunction(codeStr)
    console.log("----------------------开始清除加密字符串----------------------")
    let count = 0;
    let [ast1, count1] = clearEncryptStrCodeWalker(ast, (node, names)=>{
        return clearEncryptStrCodeHandler(vmContext, node, decStrFuncName, names);
    }, [new Set([decStrFuncName])]);
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除V1加密字符串结束,共计", count1, "处!")
    let [ast2, count2] = clearEncryptStrCodeWalker(ast1, (node, names)=>{
        return clearEncryptStrCodeV2Handler(vmContext, node, decStrFuncNameV2, names);
    }, [new Set([decStrFuncNameV2])]);
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除V2加密字符串结束,共计", count2, "处!")
    codeStr = escodegen.generate(ast2)
    writeJs(codeStr, CLEAR_ENCRYPT_STR_OUTPUT_FILE_NAME)
    return {ast, vmContext, code: codeStr}
}

/**
 * 创建节点调用
 * @param t 类型
 * @param args 参数列表
 * @return Node 当type为空时返回空
 */
function builderOperateNode(t, args) {
    if (t) {
        if (t.type === '字面量') {
            if (t.value === undefined) {
                return builders.identifier("undefined")
            }
            return builders.literal(t.value)
        } else if (t.type === "BinaryExpression" || t.type === 'LogicalExpression') {
            if (args) {
                return {
                    type: t.type,
                    left: args[0],
                    right: args[1],
                    operator: t.value
                }
            }
        } else if (t.type === "简单调用") {
            if (args !== undefined) {
                let callee = args.shift(1)
                return {
                    type: "CallExpression",
                    callee: callee,
                    arguments: args,
                    optional: false
                }
            }
        } else if (t.type === "定义") {
            return t.value
        } else {
            console.log(t)
            throw new Error("未知构建类型")
        }
    }
}

/**
 * 清除基础运算混淆
 * @param operateMap 基础运算映射
 * @param callExpressionNode 节点
 * @return Node替换节点
 */
function clearBaseOperateCallHandler(operateMap, callExpressionNode) {
    if (callExpressionNode.type === "MemberExpression" && callExpressionNode.property.type === "Literal" && callExpressionNode.object.type === "Identifier") {
        return builderOperateNode(operateMap[callExpressionNode.object.name + "_" + callExpressionNode.property.raw])
    }
    if (callExpressionNode.callee) {
        let ob = callExpressionNode.callee.object
        let pt = callExpressionNode.callee.property
        let args = callExpressionNode.arguments
        if (callExpressionNode.callee.computed && args && ob && ob.type === "Identifier" && pt.type === "Literal") {
            let arguments = []
            for (let arg of args) {
                if (arg) {
                    if (arg.type === "CallExpression" || arg.type === "MemberExpression") {
                        let i = clearBaseOperateCallHandler(operateMap, arg)
                        if (i) {
                            arguments.push(i)
                        } else {
                            arguments.push(arg)
                        }
                    } else {
                        arguments.push(arg)
                    }
                } else {
                    console.warn("错误的参数,可能代码存在语法错误:", args)
                    throw new Error("错误的参数，可能代码存在语法错误!")
                }
            }
            let type = getOperateFromMap(operateMap, ob.name, pt.value)
            if (type) {
                return builderOperateNode(type, arguments)
            } else {
                callExpressionNode.arguments = arguments
                return callExpressionNode
            }
        }
    }
}

/**
 * 操作二, 清除基础运算加密以及if else不可达代码
 * 原地操作AST树,清除基础运算操作加密
 * @param vmContext 解密使用的Context
 * @param ast AST 树
 */
function clearBaseOperateEncryptCodeAndUnreachableCode(ast, vmContext) {
    console.log("----------------------开始清除运算符加密----------------------")
    let operateMap = {}
    let operateMapStack = []
    let literalCount = 0
    let callCount = 0
    let ifCount = 0
    let boolCount = 0
    estraverse.traverse(ast, {
        enter(node) {
            if (node.type === "BlockStatement") {
                //保存操作映射表状态
                operateMapStack.push({...operateMap});
            } else if (node.type === "VariableDeclaration") {
                buildOperateMapFromVariable(operateMap, node)
            }
        },
        leave(node) {
            if (node.type === "BlockStatement") {
                estraverse.replace(node, {
                    leave(node) {
                        if (node.type === "UnaryExpression" && node.operator === "!") {
                            let r = unaryExpressionComputed(node)
                            if (r !== undefined) {
                                boolCount += 1
                                return builders.literal(r)
                            }
                        } else if (node.computed && node.type === "MemberExpression") {
                            let object = node.object
                            let property = node.property
                            if (object && property && object.type === "Identifier" && property.type === "Literal") {
                                let r = getOperateFromMap(operateMap, object.name, property.value)
                                if (r && r.type === "字面量") {
                                    literalCount += 1
                                    return builderOperateNode(r)
                                }
                            }
                        } else if (node.type === "CallExpression") {
                            let r = clearBaseOperateCallHandler(operateMap, node)
                            if (r) {
                                callCount += 1
                                return r
                            }
                        }
                    }
                })
                let childOperateMap = operateMap
                operateMap = operateMapStack.pop()
                if (config.clearVar) {
                    clearUnavailableVariableFromOperateMap(node, operateMap, childOperateMap)
                }
                return node
            }
        }
    })
    // 清除if else 无效判断
    if (config.clearIf) {
        estraverse.replace(ast, {
            leave(node) {
                if (node.type === "IfStatement") {
                    let r = clearIfStatement(node, vmContext)
                    if (r) {
                        ifCount += 1
                        return r;
                    }
                } else if (node.type === "BlockStatement") {
                    while (node.body && node.body.length === 1 && node.body[0].type === "BlockStatement") {
                        node = node.body[0]
                    }
                    return node
                }
            }
        })
    }
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除运算符加密结束,共计清除:",
        '字面量混淆:', literalCount, '处,',
        `调用加密:`, callCount, `处,`,
        `Bool混淆:`, boolCount, `处,`,
        `If不可达代码块:`, ifCount, `处,`
    )
    writeJs(escodegen.generate(changeObjectFunctionCall(ast)), CLEAR_ENCRYPT_OPERATE_OUTPUT_FILE_NAME)
    return ast
}

/**
 * 操作三,清除函数执行步骤混淆
 * @param ast ast树
 * @return {{type: string, body: *[]}}
 */
function clearFunctionExecutionStepConfusion(ast) {
    let count = 0
    let regx = /[0-9|]+/
    console.log("----------------------开始清除函数执行步骤混淆----------------------")
    estraverse.replace(ast, {
        leave(node) {
            if (node.type === "BlockStatement" && node.body) {
                let stepVar;
                let choiceVar;
                let object;
                let whileNode;
                if (node.body.length === 3 && node.body[0].type === "VariableDeclaration" && node.body[1].type === "VariableDeclaration" && node.body[2].type === "WhileStatement") {
                    stepVar = node.body[0].declarations[0]
                    choiceVar = node.body[1].declarations[0]
                    object = stepVar.init.callee.object
                    let property = stepVar.init.callee.property
                    if (
                        object && object.type === "Literal" && regx.exec(object.value)[0] === object.value &&
                        property && property.type === "Literal" && property.value === "split" &&
                        stepVar.init.arguments && stepVar.init.arguments.length === 1 && stepVar.init.arguments[0].value === "|") {
                        whileNode = node.body[2]
                    }
                } else if (node.body.length === 2 && node.body[0].type === "VariableDeclaration" && node.body[1].type === "WhileStatement") {
                    let varNodes = node.body[0]
                    if (varNodes.declarations && varNodes.declarations.length === 2) {
                        stepVar = varNodes.declarations[0]
                        choiceVar = varNodes.declarations[1]
                        object = stepVar.init.callee.object
                        let property = stepVar.init.callee.property
                        if (
                            object && object.type === "Literal" && regx.exec(object.value)[0] === object.value &&
                            property && property.type === "Literal" && property.value === "split" &&
                            stepVar.init.arguments && stepVar.init.arguments.length === 1 && stepVar.init.arguments[0].value === "|") {
                            whileNode = node.body[1]
                        }
                    }
                }
                if (stepVar && choiceVar && object) {
                    if (stepVar.type === "VariableDeclarator" && stepVar.init && stepVar.init.type === "CallExpression" && stepVar.init.callee.type === "MemberExpression") {
                        if (whileNode.test.type === "Literal" && whileNode.test.value) {
                            let whileBody = whileNode.body.body
                            if (whileBody[0].type === "SwitchStatement") {
                                let switchNode = whileBody[0]
                                let discriminant = switchNode.discriminant
                                if (
                                    discriminant && discriminant.type === "MemberExpression" &&
                                    discriminant.object && discriminant.object.type === "Identifier" && discriminant.object.name === stepVar.id.name &&
                                    discriminant.property && discriminant.property.type === "UpdateExpression" && discriminant.property.operator === "++" &&
                                    discriminant.property.argument.name === choiceVar.id.name
                                ) {
                                    //生成调用顺序映射
                                    let caseMap = {}
                                    for (let caseNode of switchNode.cases) {
                                        if (caseNode.test.type === "Literal") {
                                            caseMap[caseNode.test.value] = caseNode.consequent.filter(x => x.type !== "ContinueStatement" && x.type !== "BreakStatement")
                                        } else {
                                            throw new Error("异常case表达:" + escodegen.generate(caseNode))
                                        }
                                    }
                                    //重排调用顺序
                                    let newBody = []
                                    for (let step of object.value.split("|")) {
                                        for (let s of caseMap[step]) {
                                            newBody.push(s)
                                        }
                                    }
                                    count += 1
                                    return {
                                        type: "BlockStatement",
                                        body: newBody
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    })
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除函数执行步骤混淆结束,共计替换", count, "处!")
    writeJs(escodegen.generate(changeObjectFunctionCall(ast)), CLEAR_FUNCTION_EXECUTION_STEP_CONFUSION_OUTPUT_FILE_NAME)
    return ast
}

/**
 * 修改对象属性方法调用写法 A['a'] ===> A.a
 * 此操作会拷贝AST树
 * @param ast AST
 * @return Node 处理结果
 */
function changeObjectFunctionCall(ast) {
    ast = JSON.parse(JSON.stringify(ast))
    estraverse.replace(ast, {
        leave(node) {
            if (node.type === "MemberExpression") {
                let pt = node.property
                if (pt && pt.type === "Literal" && typeof pt.value === "string" && /^([^\x00-\xff]|[a-zA-Z_$])([^\x00-\xff]|[a-zA-Z0-9_$])*$/.test(pt.value)) {
                    node.property = {
                        "type": "Identifier",
                        "name": pt.value
                    }
                    node.computed = false
                }
            }
        }
    })
    return ast
}

/**
 * 清除数值映射
 * @param {*} ast 
 */
function clearDataMapping(ast) {
    clearDataMappingHandler(ast, {});
}

/**
 * 解密代码
 * @param codeStr 代码内容
 */
function decryptCode(codeStr) {
    let {ast, vmContext, code} = clearEncryptStrCode(code_context)
    // ast = clearBaseOperateEncryptCodeAndUnreachableCode(ast, vmContext)
    // clearFunctionExecutionStepConfusion(ast)
}

let vm = require("vm")
let fs = require("fs")
// 加密文件路径
let FILE_NAME = "sample/jsjiami.com.v7.js"
// 用于存储第一步解码加密字符串结果，可靠性高
let CLEAR_ENCRYPT_STR_OUTPUT_FILE_NAME = "clear_encrypt_str.js"
// 用于存储第二步解码加密操作以及死代码结果,可靠性低
let CLEAR_ENCRYPT_OPERATE_OUTPUT_FILE_NAME = "clear_encrypt_operate.js"
// 用于存储第三步清除函数执行步骤混淆输出文件,与上一步相同
let CLEAR_FUNCTION_EXECUTION_STEP_CONFUSION_OUTPUT_FILE_NAME = "clear_function_execution_step_confusion.js"
let acorn = require("acorn")
let escodegen = require("escodegen")
let estraverse = require("estraverse")
let {builders} = require("ast-types")
const { exit } = require("process")
const { count } = require("console")
let code_context = readJs(FILE_NAME)
let config = {
    clearIf: false,//开启清除无效if else语句
    clearVar: false,//开启清除无效操作映射变量
    vmInitScript: `
    var document = {
        domain: ''
    }
    var Host = ''
    var Domain = ()=>{}
    `// 向vm context初始化时执行的脚本,用于向环境注入变量
}

// 程序入口
decryptCode(code_context)
