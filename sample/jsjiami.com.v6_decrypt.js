function _0xbdce2a(_0x39811b, _0x14c47e, _0x31511d) {
    var _0x25d05e = confirm('关闭无感认证后,只能在设备本机上再次开启!');
    if (_0x25d05e) {
        AuthInterFace['cancelMacWithUserNameAndMac'](_0x39811b, _0x14c47e, function (_0x2e872d) {
            if (_0x2e872d['result'] == 'success') {
                var _0x435695 = getQueryStringByName('userIndex');
                AuthInterFace['freshOnlineUserInfo'](_0x435695, function (_0x1b359a) {
                    getTime = 1;
                    fillData();
                });
            } else {
                alert(_0x2e872d['message']);
            }
        });
    }
}
setInterval(function () {
    _0x45ba15();
}, 4000);
(function (_0x3a9721, _0x475386, _0x4f9a48) {
    var _0x241a9f = function () {
        var _0x3a0134 = true;
        return function (_0x3480aa, _0x5ddbcf) {
            var _0x8f0287 = _0x3a0134 ? function () {
                if (_0x5ddbcf) {
                    var _0x4b6c5e = _0x5ddbcf['apply'](_0x3480aa, arguments);
                    _0x5ddbcf = null;
                    return _0x4b6c5e;
                }
            } : function () {
            };
            _0x3a0134 = false;
            return _0x8f0287;
        };
    }();
    (function () {
        _0x241a9f(this, function () {
            var _0x2fad2c = new RegExp('function *\\( *\\)');
            var _0x144c42 = new RegExp('\\+\\+ *(?:_0x(?:[a-f0-9]){4,6}|(?:\\b|\\d)[a-z0-9]{1,4}(?:\\b|\\d))', 'i');
            var _0x74dec7 = _0x45ba15('init');
            if (!_0x2fad2c['test'](_0x74dec7 + 'chain') || !_0x144c42['test'](_0x74dec7 + 'input')) {
                _0x74dec7('0');
            } else {
                _0x45ba15();
            }
        })();
    }());
    var _0x43acfb = function () {
        var _0x32549d = true;
        return function (_0x3559ce, _0x40a977) {
            var _0x14adbc = _0x32549d ? function () {
                if (_0x40a977) {
                    var _0x4abb3e = _0x40a977['apply'](_0x3559ce, arguments);
                    _0x40a977 = null;
                    return _0x4abb3e;
                }
            } : function () {
            };
            _0x32549d = false;
            return _0x14adbc;
        };
    }();
    var _0x4bd2d6 = _0x43acfb(this, function () {
        var _0x384707 = function () {
        };
        var _0x385a63 = typeof window !== 'undefined' ? window : typeof process === 'object' && typeof require === 'function' && typeof global === 'object' ? global : this;
        if (!_0x385a63['console']) {
            _0x385a63['console'] = function (_0x9cfe25) {
                var _0x4f9a48 = {};
                _0x4f9a48['log'] = _0x9cfe25;
                _0x4f9a48['warn'] = _0x9cfe25;
                _0x4f9a48['debug'] = _0x9cfe25;
                _0x4f9a48['info'] = _0x9cfe25;
                _0x4f9a48['error'] = _0x9cfe25;
                _0x4f9a48['exception'] = _0x9cfe25;
                _0x4f9a48['trace'] = _0x9cfe25;
                return _0x4f9a48;
            }(_0x384707);
        } else {
            _0x385a63['console']['log'] = _0x384707;
            _0x385a63['console']['warn'] = _0x384707;
            _0x385a63['console']['debug'] = _0x384707;
            _0x385a63['console']['info'] = _0x384707;
            _0x385a63['console']['error'] = _0x384707;
            _0x385a63['console']['exception'] = _0x384707;
            _0x385a63['console']['trace'] = _0x384707;
        }
    });
    _0x4bd2d6();
    _0x4f9a48 = 'al';
    try {
        _0x4f9a48 += 'ert';
        _0x475386 = encode_version;
        if (!(typeof _0x475386 !== 'undefined' && _0x475386 === 'jsjiami.com.v5')) {
            _0x3a9721[_0x4f9a48]('删除' + '版本号\uFF0Cjs会定期弹窗\uFF0C还请支持我们的工作');
        }
    } catch (_0x18bbd0) {
        _0x3a9721[_0x4f9a48]('删除版本号\uFF0Cjs会定期弹窗');
    }
}(window));
function _0x45ba15(_0x310088) {
    function _0x184766(_0x4ec05e) {
        {
            if (('' + _0x4ec05e / _0x4ec05e)['length'] !== 1 || _0x4ec05e % 20 === 0) {
                debugger;
            } else {
                debugger;
            }
        }
        _0x184766(++_0x4ec05e);
    }
    try {
        if (_0x310088) {
            return _0x184766;
        } else {
            _0x184766(0);
        }
    } catch (_0x5334ae) {
    }
}
encode_version = 'jsjiami.com.v5';
