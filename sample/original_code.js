function cancelMacWithUserNameAndMac(userId, userMac, trid) {
    var test = confirm("关闭无感认证后,只能在设备本机上再次开启!");
    if (test) {
        AuthInterFace.cancelMacWithUserNameAndMac(userId, userMac, function (data) {
            if (data.result == 'success') {
                //$("#"+trid).hide();
                //$("#autoMacNumTip").html($("#autoMacNumTip").html()-1);
                var userIndex = getQueryStringByName("userIndex");
                AuthInterFace.freshOnlineUserInfo(userIndex, function (freshOnline) {
                    getTime = 1;
                    fillData();
                });
            } else {
                alert(data.message);
            }
        });
    }
}
