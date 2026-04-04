function writeJs(data, path) {
    path = path ? path : "out.js"
    fs.writeFileSync(path, data)
}

function readJs(path) {
    return fs.readFileSync(path).toString()
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
    return context.run(script);
}

/**
 * 查找并加载解密函数
 * @param codeStr 源码
 * @returns {{code: Node, vmContext: Context, name}}
 */
function findStrEncryptionFunctionV1(codeStr) {
    console.log("----------------------开始解析字符串V1解密函数----------------------")
    let ast = getAst(codeStr)
    writeJs(escodegen.generate(ast), "org.js");
    let decStrFuncName = "";
    let decFuncCodeBody = [];
    let decStrDepFuncName = "";
    let foundNode = false;
    for(let i=0; i < ast.body.length; i++) {
        let node = ast.body[i];
        try {
            // 创建解密函数体
            decFuncCodeBody.push(node);
            // 解密依赖字符串生成函数
            decStrDepFuncName = node.expression.left.expressions[0].arguments[2].name;
            // 解密函数
            decStrFuncName = node.expression.left.expressions[0].callee.body.body[0].argument.expressions[3].callee.body.body[0].declarations[0].init.name;
            if(decStrDepFuncName && decStrFuncName) {
                foundNode = true;
                break;
            }
        } catch(e) {
        }
    }
    if(!foundNode) {
        throw new Error("没有找到V1字符串加密函数！")
    }
    console.log("找到V1解密函数 ==> ", decStrFuncName, ", 找到V1解密依赖函数 ==> ", decStrDepFuncName);
    console.log("---------------------- 开始查找V1解密函数体 ----------------------")
    foundNode = 0;
    ast.body.forEach(node=>{
        // 查找解密函数节点
        if(node.type === 'FunctionDeclaration') {
            if(node.id.name === decStrFuncName) {
                foundNode = foundNode | 1;
            } else if(node.id.name === decStrDepFuncName) {
                foundNode = foundNode | 2;
            } else {
                return;
            }
            // 防止重复添加
            if(!decFuncCodeBody.includes(node)) {
                decFuncCodeBody.push(node);
            }
        }
    });
    let errors = [
        "没有找到V1解密函数节点！", 
        "没有找到V1解密函数依赖节点！"
    ];
    for(let i=0; i < errors.length; i++) {
        if((1 << i) & foundNode == 0) {
            throw new Error(errors[i])    
        }
    }
    let decFuncAst = builders.program(decFuncCodeBody);
    let decFuncCode = escodegen.generate(decFuncAst);
    writeJs(decFuncCode, "decFuncCode.js");
    const vmContext = new VM({
        timeout: 60000,          // 执行超时时间（毫秒）
        allowAsync: false,     // 是否允许异步操作
    });
    if (config.vmInitScript) {
        virtualGlobalEval(vmContext, config.vmInitScript)
    }
    virtualGlobalEval(vmContext, decFuncCode);
    return [decStrFuncName, ast, vmContext]
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
            } else if(config.showWarn) {
                console.warn("V2解密不支持 ==> ", escodegen.generate(node))
            }
        }
    }
}

function clearEncryptStrCodeV1Handler(vmCtx, node, name, names) {
    if (node.type === "CallExpression"
        && node.callee
        && node.callee.type === "Identifier"
    ) {
        if(node.arguments.length == 2 
            && node.arguments[0].type == "Literal"
            && node.arguments[1].type == "Literal") {
            if(names.has(node.callee.name)) {
                return evalDecryptStr(vmCtx, node, name)
            } else if(config.showWarn) {
                console.warn("V1字符串解密不支持 ===> ", escodegen.generate(node))
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
function clearEncryptStrCode(v1Name, ast, vmContext) {
    console.log("----------------------开始清除V1加密字符串----------------------")
    let [ast1, count1] = clearEncryptStrCodeWalker(ast, (node, names)=>{
        return clearEncryptStrCodeV1Handler(vmContext, node, v1Name, names);
    }, [new Set([v1Name])]);
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除V1加密字符串结束,共计", count1, "处!")
    codeStr = escodegen.generate(ast1)
    writeJs(codeStr, CLEAR_ENCRYPT_STR_OUTPUT_FILE_NAME)
    return ast;
}

/**
 * 清除V2加密字符串
 * @returns {{ast, vmContext: Context}} 解密后的AST节点
 */
function clearEncryptStrCodeV2(v2Name, ast, vmContext) {
    console.log("----------------------开始清除V2加密字符串----------------------")
    let [ast1, count1] = clearEncryptStrCodeWalker(ast, (node, names)=>{
        return clearEncryptStrCodeV2Handler(vmContext, node, v2Name, names);
    }, [new Set([v2Name])]);
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除V2加密字符串结束,共计", count1, "处!")
    codeStr = escodegen.generate(ast1)
    writeJs(codeStr, CLEAR_ENCRYPT_STR_V2_OUTPUT_FILE_NAME)
    return ast;
}

/**
 * 深度赋值对象
 * @param {Object} data 数据
 * @returns 
 */
function cloneJsonObj(data) {
    return JSON.parse(JSON.stringify(data));
}

function getLast(data) {
    return data[data.length-1];
}

const OpEnum = {
    CALL: "函数调用",
    BinaryExpression: "二元运算",
    Literal: "字面量",
    LogicalExpression: "逻辑表达式"
}

/**
 * 函数调用操作
 * function (lilI11li, lii111Ii) {
 *    return lilI11li(lii111Ii);
 * }
 */
function mappingOpCall(value) {
    if(value.body.body.length > 2 || value.body.body.length < 1) {
        return;
    }
    let lastBody = getLast(value.body.body);
    if(lastBody.type === "ReturnStatement" &&
        lastBody.argument.type === "CallExpression" &&
        value.params.length ===
        lastBody.argument.arguments.length + 1
    ) {
        let argsName = [];
        for(let i= 0;i < value.params.length; i ++){
            let arg = value.params[i];
            if(arg.type === "Identifier") {
                argsName.push(arg.name);
            } else {
                return;
            }
        }
        if(argsName[0] !== lastBody.argument.callee.name) {
            return;
        }
        for(let i=0; i < lastBody.argument.arguments.length; i++) {
            let arg = lastBody.argument.arguments[i];
            let argName = argsName[i+1];
            if(arg.name !== argName) {
                return;
            }
        }
        return {type: OpEnum.CALL};
    }
}

/**
 * 加法操作
 * function (II1IliIi, i11l1ll) {
 *  return II1IliIi + i11l1ll;
 * }
*/
function mappingBinaryExpression(value) {
    let body = getLast(value.body.body);
    if(value.params.length != 2 || 
        body.type !== "ReturnStatement") {
        return;
    }
    if (body.argument.type === "BinaryExpression" && 
        typeof body.argument.operator !== "undefined" &&
        value.params[0].name === body.argument.left.name && 
        value.params[1].name === body.argument.right.name) {
        return {
            type: OpEnum.BinaryExpression,
            value: body.argument.operator
        };
    }
}

/**
 * 字面量映射
 * { 'yVAVP': 'shift' }
 * @param {*} value 
 */
function mappingLiteral(value) {
    if(value.type === "Literal") {
        return {
            type: OpEnum.Literal,
            value: value.value
        }
    }
}

/**
 * 逻辑运算映射
 * @param {*} value 
 */
function mappingLogicalExpression(value) {
    if(value.type === "LogicalExpression") {
        return {
            type: OpEnum.LogicalExpression,
            value: value.operator
        }
    }

    if (value.type === "FunctionExpression" &&
        value.body.type === "BlockStatement" &&
        value.body.body.length === 1 &&
        value.body.body[0].type === "ReturnStatement" &&
        value.body.body[0].argument.type === "LogicalExpression"
    ) {
        return {
            type: OpEnum.LogicalExpression,
            value: value.body.body[0].argument.operator
        }
    }
}

/**
 * 查找函数映射表
 * @param {*} opMapList 
 * @param {*} name 
 * @param {*} createIfNotExists 
 * @returns 
 */
function findOpMap(opMapList, name, createIfNotExists) {
    for(let i=0;i <opMapList.length; i++) {
        let opMap = opMapList[i];
        if(opMap.names[name]) {
            return opMap.op;
        }
    }
    if(createIfNotExists) {
        let opMap = {
            names: {},
            op: {},
        };
        opMap.names[name] = 1;
        opMapList.push(opMap);
        return opMap.op;
    }
}

/**
 * 获取函数操作操作映射
 * @param {*} opMapList 
 * @param {*} objName 
 * @param {*} funcName 
 * @returns 
 */
function findOpFromOpMap(opMapList, objName, funcName) {
    let opMap = findOpMap(opMapList, objName);
    if(opMap) {
        return opMap[funcName];
    }
}

/**
 * 追踪函数操作映射表
 * @param {*} opMapList 函数操作映射表
 * @param {*} objName 原始对象名
 * @param {*} linkName 赋值到的对象名
 */
function trackedOpMapVariables(opMapList, objName, linkName) {
    let opMap = findOpMap(opMapList, objName);
    if(opMap) {
        opMap.names[linkName] = 1;
    }
}

/**
 * 根据节点映射操作
 * @param {*} node 节点
 * @param {*} opMap 操作映射环境
 */
function checkAndBuildOpMapping(name, node, opMap) {
    let mapFunc = [
        mappingOpCall,
        mappingBinaryExpression,
        mappingLiteral,
        mappingLogicalExpression
    ];
    for(let i=0; i < mapFunc.length; i++) {
        let f = mapFunc[i];
        try{
            let m = f(node);
            if(m) {
                opMap[name] = m;
                return;
            }
        }catch(e){}
    }
}

/**
 * 构建函数操作节点
 * @param {*} node 
 * @param {*} op 
 * @returns 
 */
function opMapFactory(node, op) {
    if(op.type === OpEnum.CALL) {
        if(node.arguments && node.arguments.length > 0) {
            return builders.callExpression(
                node.arguments[0],
                node.arguments.slice(1))
        }
    } else if(op.type === OpEnum.Literal) {
        return builders.literal(op.value);
    } else if(op.type === OpEnum.BinaryExpression) {
        if(node.arguments && node.arguments.length === 2) {
            return builders.binaryExpression(
                op.value, 
                node.arguments[0], 
                node.arguments[1]);
        }
    } else if(op.type == OpEnum.LogicalExpression) {
        if(node.arguments && node.arguments.length === 2) {
            return builders.logicalExpression(
                op.value,
                node.arguments[0],
                node.arguments[1]);
        }
    }
    if(config.showWarn) {
        console.log(`无法映射 ${op.type} ===> `, escodegen.generate(node));
    }
    return node;
}

/**
 * 清除函数调用
 * @param {Node} ast 代码树
 */
function clearOpMapping(ast) {
    console.log("----------------------开始清除操作映射----------------------")
    let mappingStack = [[]];
    let getLast = ()=>{
        return mappingStack[mappingStack.length-1];
    }
    let count = 0;
    ast = estraverse.replace(ast, {
        enter(node){
            if(node.type === 'BlockStatement') {
                mappingStack.push(cloneJsonObj(getLast()));
            }
            return node;
        },
        leave(node) {
            let objName = undefined;
            let funcName = undefined;
            if(node.type === 'BlockStatement') {
                mappingStack.pop();
            } else if(node.type === "MemberExpression" &&
                node.object &&
                node.object.type === "Identifier" &&
                node.property &&
                node.property.type === "Literal"
            ) {
                objName = node.object.name;
                funcName = node.property.value;
            } else if(node.type === "CallExpression" && 
                node.callee.type === "MemberExpression" && 
                node.callee.property &&     
                node.callee.property.type === "Literal" &&
                node.callee.object && 
                node.callee.object.type === "Identifier"
            ) {
                objName = node.callee.object.name;
                funcName = node.callee.property.value;
            }
            if(objName && funcName) {
                let op = findOpFromOpMap(getLast(), objName, funcName);
                if(op) {
                    let ret = opMapFactory(node, op);
                    if(ret) {
                        count++;
                        return ret;
                    } else {
                        console.warn("创建映射原节点: ", escodegen.generate(node));
                    }
                } else {
                    console.debug("无法找到映射操作: ", escodegen.generate(node));
                }
            }
            if(node.type === 'VariableDeclarator' && node.init) {
                if(node.init.type === "ObjectExpression") {
                    let opMap = findOpMap(getLast(), node.id.name, true);
                    node.init.properties.forEach(prop=>{
                        if(prop.key) {
                            let key = '';
                            if(prop.key.type==="Literal") {
                                key = prop.key.value;
                            } else if(prop.key.type === "Identifier") {
                                key = prop.key.name;
                            }
                            if(key) {
                                checkAndBuildOpMapping(key, prop.value, opMap);
                            }
                        }
                    });
                } else if(
                    node.init.type === "Identifier" && 
                    node.id.type === "Identifier"
                ) {
                    // 追踪函数调用映射
                    trackedOpMapVariables(getLast(), node.init.name, node.id.name);
                }
            }
            return node;
        }
    });
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除操作映射结束,共计", count, "处!")
    writeJs(escodegen.generate(ast), CLEAR_ENCRYPT_OPERATE_OUTPUT_FILE_NAME);
    return ast;
}

/**
 * 清除IF不可达代码
 * @param {*} ast 
 */
function clearUnreachableIfCode(ast, vmCtx) {
    console.log("----------------------开始清除不可达IF代码----------------------")
    let count = 0;
    ast = estraverse.replace(ast, {
        leave(node){
            if(node.type === "IfStatement" &&
                node.test.type === "BinaryExpression" &&
                node.test.left.type === "Literal" &&
                node.test.right.type === "Literal"
            ) {
                try{
                    let ret = virtualGlobalEval(vmCtx, escodegen.generate(node.test));
                    count++;
                    if(ret) {
                        return node.consequent;
                    } else {
                        return node.alternate;
                    }
                }catch(e) {}
            }
            return node;
        }
    });
    ast = optimizeCodeStructure(ast);
    writeJs(escodegen.generate(ast), CLEAR_UNREACHABLE_IF_CODE_OUTPUT_FILE_NAME);
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除不可达IF代码,共计", count, "处!")
    return ast;
}

/**
 * 清除未引用变量
 * @param {*} ast 
 */
function clearUnreachableVariable(ast) {
    console.log("----------------------开始清除无效变量定义----------------------")
    let varStack = [{}];
    let deRef = (name)=>{
        for(let i = varStack.length -1; i >= 0; i--) {
            if(varStack[i][name]) {
                varStack[i][name]--;
                return;
            }
        }
    };
    let incRef = (name)=>{
        for(let i = varStack.length -1; i >= 0; i--) {
            if(varStack[i][name] !== undefined) {
                varStack[i][name]++;
                return;
            }
        }
        varStack[varStack.length - 1][name] = 1;
    }
    let count = 0;
    ast = estraverse.replace(ast, {
        enter(node){
            if(node.type === 'BlockStatement') {
                varStack.push({});
            } else if(node.type === "Identifier") {
                incRef(node.name);
            } else if(node.type === "VariableDeclarator" && 
                node.id && node.id.type === "Identifier"){
                if(varStack[varStack.length-1][node.id.name] === undefined) {
                    varStack[varStack.length-1][node.id.name] = -1;
                }
            } else if(node.type === "ForInStatement" &&
                node.left.type === "VariableDeclaration"
            ) {
                node.left.declarations.forEach(dNode=>{
                    if(dNode.type == "VariableDeclarator" && dNode.id.type === "Identifier") {
                        varStack[varStack.length-1][dNode.id.name] = 1;
                    }
                });
            }
            return node;
        },
        leave(node){
            if(node.type === 'BlockStatement') {
                let localVar = varStack.pop();
                node = estraverse.replace(node, {
                    leave(node1) {
                        if(node1.type === "VariableDeclarator" && 
                            node1.id && node1.id.type === "Identifier") {
                            if(localVar[node1.id.name] === 0) {
                                delete localVar[node1.id.name];
                                if(node1.init && node1.init.type === "Identifier") {
                                    deRef(node1.init.name);
                                }
                                count++;
                                return estraverse.VisitorOption.Remove;
                            } else {
                                console.log("无法清除", escodegen.generate(node1));
                            }
                        } else if(node1.type === "VariableDeclaration" && node1.declarations.length == 0) {
                            return estraverse.VisitorOption.Remove;
                        }
                        if(Object.keys(localVar).length == 0) {
                            return estraverse.VisitorOption.Break;
                        }
                        return node1;
                    }
                });
            }
            return node;
        }
    });
    console.log(">>>>>>>>>>>>>>>>>>>>>>>清除无效变量定义结束,共计", count, "处!");
    writeJs(escodegen.generate(ast), CLEAR_UNREACHABLE_VAR_OUTPUT_FILE_NAME);
    return ast;
}

/**
 * 优化代码结构
 * @param {*} ast 
 */
function optimizeCodeStructure(ast) {
    let count = 0;
    ast = estraverse.replace(ast, {
        leave(node) {
            if(node.type === "BlockStatement" &&
                node.body.length == 1 &&
                node.body[0].type === "BlockStatement"
            ) {
                count++;
                return node.body[0];
            }
            return node;
        }
    });
    console.log(`>>>>优化代码结构结束,共计 ${count} 处`);
    return ast;
}

function findStrEncryptionFunctionV2(vmCtx, ast) {
    console.log("----------------------开始解析字符串V2解密函数----------------------")
    let decBody = [];
    let encCodeBody = []
    let decFuncName = undefined;
    let depFuncName = undefined;
    for(let i=0; i<ast.body.length;i++) {
        try {
            let node = ast.body[i];
            if(node.expression.type === "CallExpression" &&
               node.expression.arguments[0].type === "Identifier" && 
               node.expression.arguments[1].type == "Literal" &&
               node.expression.callee.body.body[0].type === "VariableDeclaration" &&
               node.expression.callee.body.body[1].type === "ExpressionStatement") {
               depFuncName = node.expression.arguments[0].name;
               decFuncName = node.expression.callee.body.body[2].declarations[0].init.name
               if(decFuncName && depFuncName) {
                    node.expression.callee.body.body = node.expression.callee.body.body.slice(2);
                    decBody.push(node);
                     break;
               }
            }
        } catch(e) {}
    }
    if(!decFuncName) {
        throw new Error("无法找到V2解密函数");
    }
    if(!depFuncName) {
        throw new Error("无法找到V2解密函数依赖函数");
    }
    console.log("找到V1解密函数 ==> ", decFuncName, ", 找到V1解密依赖函数 ==> ", depFuncName);
    console.log("---------------------- 开始查找V1解密函数体 ----------------------")
    let foundDepFuncName = false;
    let foundDecFuncName = false;
    ast.body.forEach(node=>{
        if(node.type === "FunctionDeclaration" && (!foundDecFuncName || !foundDepFuncName)) {
            if(!foundDecFuncName && node.id.name === depFuncName) {
                foundDecFuncName = true;
                decBody.push(node);
                return;
            }
            if (!foundDepFuncName && node.id.name === decFuncName) {
                foundDepFuncName = true;
                decBody.push(node);
                return;
            }
        }
        if(decBody.indexOf(node)==-1) {
            encCodeBody.push(node);
        }
    });
    if(!foundDecFuncName) {
        throw new Error("无法找到V2解密函数依函数体");
    }
    if(!foundDepFuncName) {
        throw new Error("无法找到V2解密函数依赖函数体");
    }
    let decCode = escodegen.generate(builders.program(decBody));
    virtualGlobalEval(vmCtx, decCode);
    writeJs(decCode, "decV2.js");
    return [builders.program(encCodeBody), decFuncName]
}

/**
 * 解密代码
 * @param codeStr 代码内容
 */
function decryptCode(codeStr) {
    let [decName, ast, vmContext] = findStrEncryptionFunctionV1(codeStr)
    ast = clearEncryptStrCode(decName, ast, vmContext)
    ast = clearOpMapping(ast);
    ast = clearUnreachableIfCode(ast, vmContext);
    ast = clearUnreachableVariable(ast);
    [ast, decName] = findStrEncryptionFunctionV2(vmContext, ast)
    ast = clearEncryptStrCodeV2(decName, ast, vmContext)
    ast = clearOpMapping(ast);
    ast = clearUnreachableIfCode(ast, vmContext);
    ast = clearUnreachableVariable(ast);
}

let { VM } = require('@flowiseai/nodevm');
let fs = require("fs")
// 加密文件路径
let FILE_NAME = "sample/jsjiami.com.v7_high.js"
// let FILE_NAME = "sample/v7.simple.js"
// 解码加密字符串结果，可靠性高
let CLEAR_ENCRYPT_STR_OUTPUT_FILE_NAME = "clear_encrypt_str.js"
// 解码加密操作
let CLEAR_ENCRYPT_OPERATE_OUTPUT_FILE_NAME = "clear_encrypt_operate.js"
// 存储清除不可达IF代码
let CLEAR_UNREACHABLE_IF_CODE_OUTPUT_FILE_NAME = "clear_unreachable_code.js"
// 清除不可达变量定义
let CLEAR_UNREACHABLE_VAR_OUTPUT_FILE_NAME = "clear_unreachable_var.js"
// 解码V2加密字符串结果
let CLEAR_ENCRYPT_STR_V2_OUTPUT_FILE_NAME = "clear_encrypt_str_v2.js"
let acorn = require("acorn")
let escodegen = require("escodegen")
let estraverse = require("estraverse")
let {builders} = require("ast-types")
let code_context = readJs(FILE_NAME)
let config = {
    clearIf: false,//开启清除无效if else语句
    clearVar: false,//开启清除无效操作映射变量
    showWarn: false,//打印警告
    findV2Dec: false, //查找V2解密函数
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
