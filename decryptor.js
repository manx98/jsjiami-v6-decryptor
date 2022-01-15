let vm = require("vm")
let fs = require("fs")
// let FILE_NAME = "decryptString.js"
// let FILE_NAME = "sample/simple01.js"
// let FILE_NAME = "sample/t01.js"
let FILE_NAME = "sample/md5.js"
let acorn = require("acorn")
let escodegen = require("escodegen")
let esprima = require("esprima")
let estraverse = require("estraverse")
let {builders, namedTypes} = require("ast-types")
let code_context = fs.readFileSync(FILE_NAME).toString()

function writeJson(data, path) {
    path = path ? path : "out.json"
    fs.writeFileSync(path, JSON.stringify(data, null, 2))
}

function writeJs(data, path) {
    path = path ? path : "out.js"
    fs.writeFileSync(path, data)
}

function replaceEncryptNode(value, node, parent) {
    switch (parent.type) {
        case "AssignmentExpression": {
            if (parent.left.type === "CallExpression" && parent.left.callee.start === node.start) {
                parent.left = builders.literal(value)
            } else if (parent.right.type === "CallExpression" && parent.right.callee.start === node.start) {
                parent.right = builders.literal(value)
            } else {
                console.log("不支持的表达式类型:", parent)
                throw new Error("不支持的表达式类型!")
            }
        }
            break;
        case "MemberExpression": {
            parent.property = builders.literal(value)
        }
            break;
        default: {
            console.log("不支持的表达式类型:", parent)
            throw new Error("不支持的表达式类型!")
        }
    }
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
                            return parentVariableMap[object.name + '_' + property.raw]
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
                                            return null
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
                        value: body.argument.value
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
    return null
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
 * 解析基础连续取反
 * @param unaryExpressionNode
 * @return {boolean}
 */
function unaryExpressionComputed(unaryExpressionNode) {
    let r = unaryExpressionNode.argument
    if (r.type === "UnaryExpression") {
        let res = unaryExpressionComputed(r)
        if (res !== undefined) {
            return !res
        }
    }
    if (r.type === "ArrayExpression" && r.elements.length === 0) {
        return true
    }
    console.log("不支持的UnaryExpression表达", escodegen.generate(r))
}

/**
 * 检查并创建基础运算操作表对象是否只含有基础加密和字符常量, 并生成映射列表
 * @param parentVariableMap 父级基础运算操作符函数映射{变量名+key:{type,value}}
 * @param decryptVariableNode 基础运算操作符函数映射对象节点
 */
function buildOperateMapFromVariable(parentVariableMap, decryptVariableNode) {
    //判断函数体第一行是不是var变量
    if (decryptVariableNode && decryptVariableNode.type === "VariableDeclaration") {
        //判断变量是否只有一个
        if (decryptVariableNode.declarations && decryptVariableNode.declarations.length === 1) {
            let declarations = decryptVariableNode.declarations[0]
            let key = declarations.id.name
            // 判断定义的变量是否是Object类型
            if (declarations.init) {
                if (declarations.init.type === "ObjectExpression") {
                    for (let property of declarations.init.properties) {
                        if (property.value.type === "Literal") {
                            setAndCheck(
                                parentVariableMap,
                                key + '_' + property.key.raw,
                                {
                                    value: property.value.value,
                                    type: "字面量"
                                }
                            )
                        } else if (property.value.type === "FunctionExpression") {
                            let v = isSimpleBaseOperateFunction(key, parentVariableMap, property.value)
                            if (v) {
                                setAndCheck(parentVariableMap, key + '_' + property.key.raw, v)
                            } else {
                                console.log("FunctionExpression 不受支持：", property)
                            }
                        } else if (property.value.type === "MemberExpression") {
                            let ob = property.value.object
                            let pt = property.value.property
                            setAndCheck(parentVariableMap, key + '_' + property.key.raw, parentVariableMap[ob.name + '_' + pt.raw])
                        } else if (property.value.type === "Identifier") {
                            setAndCheck(parentVariableMap, key + '_' + property.key.raw, {
                                type: "定义",
                                value: property.value
                            })
                        } else if (property.value.type === "UnaryExpression") {
                            //处理!![]
                            let r = unaryExpressionComputed(property.value)
                            if (r !== undefined) {
                                setAndCheck(parentVariableMap, key + '_' + property.key.raw, {
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
}

/**
 * 原地操作AST树,清除基础运算操作加密
 * @param ast AST 树
 */
function clearBaseOperateCall(ast) {
    let operateMap = {}
    let operateMapStack = []
    estraverse.replace(ast, {
        enter(node) {
            if (node.type === "BlockStatement") {
                operateMapStack.push({...operateMap});
            }
        },
        leave(node, parent) {
            if (node.type === "VariableDeclaration") {
                buildOperateMapFromVariable(operateMap, node)
            } else if (node.computed && node.type === "MemberExpression") {
                let object = node.object
                let property = node.property
                if (object && property && object.type === "Identifier" && property.type === "Literal") {
                    let r = operateMap[object.name + "_" + property.raw]
                    if (r && r.type === "字面量") {
                        return builderOperateNode(r)
                    }
                }
            } else if (node.type === "CallExpression") {
                let r = clearBaseOperateCallHandler(operateMap, node)
                if (r) {
                    return r
                }
            } else if (node.type === "BlockStatement") {
                operateMap = operateMapStack.pop()
            }
        }
    })
}


function clearUnavailableVariable(ast) {

}

/**
 * 基础运算操作加密解密
 * @param parentVariableMap 父级基础运算操作符函数映射{变量名+key:{type,value}}
 * @param functionNode 函数节点
 */
function baseOperateDecryptFunctionCheck(parentVariableMap, functionNode) {
    let body = functionNode.body
    for (let variableNode of body) {
        if (variableNode.type === "VariableDeclaration") {
            buildOperateMapFromVariable(parentVariableMap, variableNode)
        } else if (variableNode.type === "BlockStatement" || variableNode.type === "FunctionDeclaration") {
            estraverse.replace(variableNode, {
                enter(node) {
                    if (node.type === "BlockStatement") {
                        this.skip()
                        // console.log(node.id)
                        return baseOperateDecryptFunctionCheck({...parentVariableMap}, node)
                    } else if (node.type === "FunctionDeclaration") {
                        this.skip()
                        return baseOperateDecryptFunctionCheck({...parentVariableMap}, node.body)
                    }
                }
            })
        }
    }
    console.log("操作映射表：", parentVariableMap)
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
 * @returns {{code: string, vmContext: Context, name}}
 */
function findStrEncryptionFunction(codeStr) {
    let program = getAst(codeStr)['body']
    let vmContext = vm.createContext()
    for (let i = 0; i < 3; ++i) {
        virtualGlobalEval(vmContext, codeStr.substring(program[i].start, program[i].end))
    }
    codeStr = codeStr.substring(program[2].end, codeStr.length)
    return {
        name: program[2].declarations[0].id.name,
        code: codeStr,
        vmContext
    }
}

/**
 * 操作一,解密字符串加密
 * @returns {*} 解密后的JS代码
 */
function decryptStr(codeStr) {
    let {name, code, vmContext} = findStrEncryptionFunction(codeStr)
    let ast = getAst(code)
    estraverse.replace(ast, {
        enter(node) {
            if (node.type === "CallExpression" && node.callee.name === name) {
                let o = virtualGlobalEval(vmContext, code.substring(node.start, node.end))
                return builders.literal(o)
            }
            return node
        }
    })
    code = escodegen.generate(ast)
    writeJson(getAst(code))
    writeJs(code, "decryptString.js")
    return code
}

/**
 * 创建节点调用
 * @param t 类型
 * @param args 参数列表
 * @return Node 当type为空时返回空
 */
function builderOperateNode(t, args) {
    if (t) {
        // console.log("构建节点：", t)
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
                    console.log("糟糕的参数:", args)
                    throw new Error("糟糕的参数!")
                }
            }
            let type = operateMap[ob.name + "_" + pt.raw]
            if (type) {
                return builderOperateNode(type, arguments)
            } else {
                callExpressionNode.arguments = arguments
                return callExpressionNode
            }
        } else {
            // console.log("检查失败节点:", escodegen.generate(callExpressionNode))
        }
    }
}

/**
 * 操作二, 解密基础运算加密
 */
function decryptBaseOperateEncrypt(codeStr) {
    let ast = getAst(codeStr);
    clearBaseOperateCall(ast)
    writeJs(escodegen.generate(ast), "clear.js")
    // writeJson(operateMap, "映射.json")
    // clearBaseOperateCall(operateMap, ast)
}

// writeJson(esprima.parse(code_context))
// decryptStr(code_context)
decryptBaseOperateEncrypt(decryptStr(code_context))

// let data = `let a = b(c , d)`
// let a = getAst(data)
// writeJson(a, "t.json")
// fs.writeFileSync("result.json", format_context)
