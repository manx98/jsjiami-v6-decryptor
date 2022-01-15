function writeJs(data, path) {
    path = path ? path : "out.js"
    fs.writeFileSync(path, data)
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
                if (argument.type === 'BinaryExpression') {
                    let params = functionNode.params
                    if (
                        params.length === 2 &&
                        argument.left.type === "Identifier" && argument.left.name === params[0].name &&
                        argument.right.type === "Identifier" && argument.right.name === params[1].name
                    ) {
                        return {
                            type: "运算符",
                            value: argument.operator
                        }
                    } else {
                        console.log("意外的计算表达式：", functionNode)
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
                        console.log("不受支持的表达式:", escodegen.generate(functionNode))
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
                console.log("不受支持的表达式:", escodegen.generate(functionNode))
            }
        }
    }
}

function setAndCheck(o, k, v) {
    let cv = o[k]
    if (v && cv) {
        if (cv.type !== v.type || cv.value !== v.value) {
            console.log("数据已经存在：", o[k], cv)
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
            console.error("执行表达式失败：", escodegen.generate(test))
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
    if (decryptVariableNode.declarations && decryptVariableNode.declarations.length === 1) {
        let declarations = decryptVariableNode.declarations[0]
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
                            console.log("FunctionExpression 不受支持：", property)
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
                        console.log("未判断，且不受支持：", key, " ---> ", escodegen.generate(property))
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
    let program = ast.body
    program = program.filter(x => x.type !== "EmptyStatement")
    let vmContext = vm.createContext()
    if (config.vmInitScript) {
        virtualGlobalEval(vmContext, config.vmInitScript)
    }
    let name = null
    for (let i = 0; i < 3; ++i) {
        let p = program.shift(0)
        virtualGlobalEval(vmContext, codeStr.substring(p.start, p.end))
        if (i === 2) {
            if (p.type === "FunctionDeclaration") {
                name = p.id.name
            }
            if (p.type === "VariableDeclaration") {
                name = p.declarations[0].id.name
            }
        }
    }
    if (!name) {
        throw new Error("没有找到字符串加密函数！")
    }
    console.log(">>>>>>>>>>>>>>>>>>>>>>>已找到解密函数：", name)
    ast.body = program
    return {
        name,
        ast,
        vmContext
    }
}

/**
 * 操作一,清除加密字符串
 * @returns {{ast, vmContext: Context}} 解密后的AST节点
 */
function clearEncryptStrCode(codeStr) {
    let {name, ast, vmContext} = findStrEncryptionFunction(codeStr)
    console.log("----------------------开始清除加密字符串----------------------")
    let count = 0
    estraverse.replace(ast, {
        leave(node) {
            if (node.type === "CallExpression" && node.callee.name === name) {
                let o = virtualGlobalEval(vmContext, escodegen.generate(node))
                count += 1
                return builders.literal(o)
            }
            return node
        }
    })
    writeJs(escodegen.generate(ast), CLEAR_ENCRYPT_STR_OUTPUT_FILE_NAME)
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除加密字符串结束,共计", count, "处!")
    return {ast, vmContext}
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
        } else if (t.type === "运算符") {
            if (args) {
                return {
                    type: "BinaryExpression",
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
                        // console.log("使用递归！")
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
                    console.log("错误的参数,可能代码存在语法错误:", args)
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
                }
            }
        })
    }
    //用于简化重复嵌套代码块
    estraverse.replace(ast, {
        enter(node) {
            if (node.type === "BlockStatement") {
                while (node.body && node.body.length === 1 && node.body[0].type === "BlockStatement") {
                    node = node.body[0]
                }
                return node
            }
        }
    })
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除运算符加密结束,共计清除:",
        '字面量混淆:', literalCount, '处,',
        `调用加密:`, callCount, `处,`,
        `Bool混淆:`, boolCount, `处,`,
        `If不可达代码块:`, ifCount, `处,`
    )
    writeJs(escodegen.generate(ast), CLEAR_ENCRYPT_OPERATE_OUTPUT_FILE_NAME)
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
            if (
                node.type === "BlockStatement" &&
                node.body && node.body.length === 2 &&
                node.body[0].type === "VariableDeclaration" &&
                node.body[1].type === "WhileStatement"
            ) {
                let varNodes = node.body[0]
                if (varNodes.declarations && varNodes.declarations.length === 2) {
                    let stepVar = varNodes.declarations[0]
                    let choiceVar = varNodes.declarations[1]
                    if (stepVar.type === "VariableDeclarator" && stepVar.init && stepVar.init.type === "CallExpression" && stepVar.init.callee.type === "MemberExpression") {
                        let object = stepVar.init.callee.object
                        let property = stepVar.init.callee.property
                        if (
                            object && object.type === "Literal" && regx.exec(object.value)[0] === object.value &&
                            property && property.type === "Literal" && property.value === "split" &&
                            stepVar.init.arguments && stepVar.init.arguments.length === 1 && stepVar.init.arguments[0].value === "|") {
                            let whileNode = node.body[1]
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
        }
    })
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除函数执行步骤混淆结束,共计替换", count, "处!")
    writeJs(escodegen.generate(ast), CLEAR_FUNCTION_EXECUTION_STEP_CONFUSION_OUTPUT_FILE_NAME)
    return ast
}

/**
 * 解密代码
 * @param codeStr 代码内容
 */
function decryptCode(codeStr) {
    let {ast, vmContext} = clearEncryptStrCode(code_context)
    clearBaseOperateEncryptCodeAndUnreachableCode(ast, vmContext)
    clearFunctionExecutionStepConfusion(ast)
}

let vm = require("vm")
let fs = require("fs")
// 加密文件路径
let FILE_NAME = "sample/jsjiami.com.v5_high.js"
// 用于存储第一步解码加密字符串结果
let CLEAR_ENCRYPT_STR_OUTPUT_FILE_NAME = "clear_encrypt_str.js"
// 用于存储第二步解码加密操作以及死代码结果
let CLEAR_ENCRYPT_OPERATE_OUTPUT_FILE_NAME = "clear_encrypt_operate.js"
// 用于存储第二步清除函数执行步骤混淆输出文件
let CLEAR_FUNCTION_EXECUTION_STEP_CONFUSION_OUTPUT_FILE_NAME = "clear_function_execution_step_confusion.js"
// let FILE_NAME = "sample/operate.js"
let acorn = require("acorn")
let escodegen = require("escodegen")
let estraverse = require("estraverse")
let {builders} = require("ast-types")
let code_context = fs.readFileSync(FILE_NAME).toString()
let config = {
    clearIf: true,//开启清除无效if else语句
    clearVar: true,//开启清除无效操作映射变量
    vmInitScript: `
    var document = {
        domain: ''
    }
    var Host = ''
    var Domain = ''
    `// 向vm context初始化时执行的脚本,用于向环境注入变量
}

// 程序入口
decryptCode(code_context)
