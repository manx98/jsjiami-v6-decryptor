function _0x2f3afb(_0x587b5b, _0x2018d2, _0x516f69) {
    var _0x1a075d = confirm('关闭无感认证后,只能在设备本机上再次开启!');
    if (_0x1a075d) {
        AuthInterFace.cancelMacWithUserNameAndMac(_0x587b5b, _0x2018d2, function (_0x1cafc9) {
            if (_0x1cafc9.result == 'success') {
                var _0x421622 = getQueryStringByName('userIndex');
                AuthInterFace.freshOnlineUserInfo(_0x421622, function (_0x2bc4bb) {
                    getTime = 1;
                    fillData();
                });
            } else {
                alert(_0x1cafc9.message);
            }
        });
    }
}
setInterval(function () {
    _0x46308f();
}, 4000);
(function (_0x1eff16, _0x26ac78, _0x20c36d) {
    var _0x236398 = function () {
        var _0x11c14e = true;
        return function (_0x5e6e74, _0x3d0393) {
            var _0x326630 = _0x11c14e ? function () {
                if (_0x3d0393) {
                    var _0x5451fd = _0x3d0393.apply(_0x5e6e74, arguments);
                    _0x3d0393 = null;
                    return _0x5451fd;
                }
            } : function () {
            };
            _0x11c14e = false;
            return _0x326630;
        };
    }();
    (function () {
        _0x236398(this, function () {
            var _0x56040c = new RegExp('function *\\( *\\)');
            var _0x4158ac = new RegExp('\\+\\+ *(?:_0x(?:[a-f0-9]){4,6}|(?:\\b|\\d)[a-z0-9]{1,4}(?:\\b|\\d))', 'i');
            var _0x2b00bd = _0x46308f('init');
            if (!_0x56040c.test(_0x2b00bd + 'chain') || !_0x4158ac.test(_0x2b00bd + 'input')) {
                _0x2b00bd('0');
            } else {
                _0x46308f();
            }
        })();
    }());
    var _0x529d12 = function () {
        var _0x556e30 = true;
        return function (_0x2a75ea, _0x606312) {
            var _0x553a83 = _0x556e30 ? function () {
                if (_0x606312) {
                    var _0x438dd8 = _0x606312.apply(_0x2a75ea, arguments);
                    _0x606312 = null;
                    return _0x438dd8;
                }
            } : function () {
            };
            _0x556e30 = false;
            return _0x553a83;
        };
    }();
    var _0x19b045 = _0x529d12(this, function () {
        var _0x5981df = function () {
        };
        var _0x53bb89 = typeof window !== 'undefined' ? window : typeof process === 'object' && typeof require === 'function' && typeof global === 'object' ? global : this;
        if (!_0x53bb89.console) {
            _0x53bb89.console = function (_0x42eb39) {
                var _0x20c36d = {};
                _0x20c36d.log = _0x42eb39;
                _0x20c36d.warn = _0x42eb39;
                _0x20c36d.debug = _0x42eb39;
                _0x20c36d.info = _0x42eb39;
                _0x20c36d.error = _0x42eb39;
                _0x20c36d.exception = _0x42eb39;
                _0x20c36d.trace = _0x42eb39;
                return _0x20c36d;
            }(_0x5981df);
        } else {
            _0x53bb89.console.log = _0x5981df;
            _0x53bb89.console.warn = _0x5981df;
            _0x53bb89.console.debug = _0x5981df;
            _0x53bb89.console.info = _0x5981df;
            _0x53bb89.console.error = _0x5981df;
            _0x53bb89.console.exception = _0x5981df;
            _0x53bb89.console.trace = _0x5981df;
        }
    });
    _0x19b045();
    _0x20c36d = 'al';
    try {
        _0x20c36d += 'ert';
        _0x26ac78 = encode_version;
        if (!(typeof _0x26ac78 !== 'undefined' && _0x26ac78 === 'jsjiami.com.v5')) {
            _0x1eff16[_0x20c36d]('删除' + '版本号\uFF0Cjs会定期弹窗\uFF0C还请支持我们的工作');
        }
    } catch (_0x2fc49a) {
        _0x1eff16[_0x20c36d]('删除版本号\uFF0Cjs会定期弹窗');
    }
}(window));
function _0x46308f(_0x29ab77) {
    function _0x362d29(_0x704624) {
        {
            if (('' + _0x704624 / _0x704624).length !== 1 || _0x704624 % 20 === 0) {
                debugger;
            } else {
                debugger;
            }
        }
        _0x362d29(++_0x704624);
    }
    try {
        if (_0x29ab77) {
            return _0x362d29;
        } else {
            _0x362d29(0);
        }
    } catch (_0x426237) {
    }
}
encode_version = 'jsjiami.com.v5';
