sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel",
  ],
  function (Controller, MessageToast, JSONModel) {
    "use strict";

    return Controller.extend("glmgtnsp.workflowuimodule.controller.App", {
      onInit: function () {
        var oComponent = this.getOwnerComponent();
        oComponent.attachEvent(
          "modelContextChange",
          this._onContextModelChange,
          this,
        );

        var oViewModel = new JSONModel({ Attachments: [], PreviewFile: null });
        this.getView().setModel(oViewModel, "view");

        this.onLoginChange();
      },

      _applyStatusStyle: function () {
        var oContextModel =
          this.getView().getModel("context") ||
          this.getOwnerComponent().getModel("context");

        if (!oContextModel) {
          return;
        }

        var wfType = oContextModel.getProperty("/WorkflowType");
        var sStatus = oContextModel.getProperty("/RequestStatus");

        var oNestedView = this.byId("nested" + wfType);
        if (!oNestedView) {
          return;
        }

        var oText = oNestedView.byId("txtStatus");
        if (!oText) {
          return;
        }

        oText.removeStyleClass("pending");
        oText.removeStyleClass("approved");
        oText.removeStyleClass("rejected");

        switch (sStatus) {
          case "PENDING APPROVAL":
            oText.addStyleClass("requestStatus");
            oText.addStyleClass("pending");
            break;
          case "REJECTED":
            oText.addStyleClass("requestStatus");
            oText.addStyleClass("rejected");
            break;
          default:
            oText.addStyleClass("requestStatus");
            oText.addStyleClass("approved");
            break;
        }
      },

      _onContextModelChange: function () {
        var oContextModel =
          this.getView().getModel("context") ||
          this.getOwnerComponent().getModel("context");

        if (oContextModel) {
          setTimeout(
            function () {
              this._loadDmsAttachmentsOnly();
              this._loadDmsPreviewFile();
              this._updateInboxActions();
              this._applyStatusStyle();
            }.bind(this),
            1000,
          );
        }
      },

      _loadDmsAttachmentsOnly: function () {
        var oView = this.getView();
        var oViewModel = oView.getModel("view");
        var oContextModel =
          oView.getModel("context") ||
          this.getOwnerComponent().getModel("context");

        if (!oViewModel || !oContextModel) return;

        var sFolderId = oContextModel.getProperty("/FolderID");

        if (!sFolderId || sFolderId === "undefined") {
          oViewModel.setProperty("/Attachments", []);
          return;
        }

        oView.setBusy(true);

        var oConfig =
          this.getOwnerComponent().getManifestEntry("/sap.ui5/config");
        var sBaseApiUrl = oConfig.dmsApiUrl;
        var sApiUrl = sBaseApiUrl.replace("{FOLDER_ID}", sFolderId);

        jQuery.ajax({
          url: sApiUrl,
          method: "GET",
          dataType: "json",
          success: function (oData) {
            oView.setBusy(false);
            var aApiAttachments = [];

            if (oData && oData.success && oData.items) {
              aApiAttachments = oData.items.map(function (oItem) {
                return {
                  fileName: oItem.name,
                  fileIcon: oItem.fileIcon,
                  fileUrl: oItem.previewUrl,
                  isFolder: oItem.isFolder,
                };
              });
            } else {
              MessageToast.show("ไม่พบไฟล์ใน Folder หรือโครงสร้าง API ไม่ตรง");
            }

            oViewModel.setProperty("/Attachments", aApiAttachments);
          }.bind(this),
          error: function (oError) {
            oView.setBusy(false);
            jQuery.sap.log.error(oError);
            MessageToast.show("เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย API");
            oViewModel.setProperty("/Attachments", []);
          }.bind(this),
        });
      },

      _loadDmsPreviewFile: function () {
        var oView = this.getView();
        var oViewModel = oView.getModel("view");
        var oContextModel =
          oView.getModel("context") ||
          this.getOwnerComponent().getModel("context");

        if (!oViewModel || !oContextModel) return;

        var sPreviewFolderId = oContextModel.getProperty("/PreviewFolderID");

        if (!sPreviewFolderId || sPreviewFolderId === "undefined") {
          oViewModel.setProperty("/PreviewFile", null);
          return;
        }

        var oConfig = this.getOwnerComponent().getManifestEntry("/sap.ui5/config");
        var sBaseApiUrl = oConfig.dmsApiUrl;
        var sApiUrl = sBaseApiUrl.replace("{FOLDER_ID}", sPreviewFolderId);

        jQuery.ajax({
          url: sApiUrl,
          method: "GET",
          dataType: "json",
          success: function (oData) {
            if (oData && oData.success && oData.items && oData.items.length > 0) {
              var oPreview = {
                fileName: oData.items[0].name,
                fileUrl: oData.items[0].previewUrl,
              };
              oViewModel.setProperty("/PreviewFile", oPreview);
            } else {
              oViewModel.setProperty("/PreviewFile", null);
            }
          }.bind(this),
          error: function (oError) {
            jQuery.sap.log.error(oError);
            oViewModel.setProperty("/PreviewFile", null);
          }.bind(this),
        });
      },

      onLoginChange: function () {
        var sUsername = this.getView().byId("usernameInput")
          ? this.getView().byId("usernameInput").getValue()
          : "";
        var sPassword = this.getView().byId("passwordInput")
          ? this.getView().byId("passwordInput").getValue()
          : "";
        var bIsValid =
          sUsername.trim().length > 0 && sPassword.trim().length > 0;

        var oLoginButton = this.getView().byId("loginButton");
        if (oLoginButton) {
          oLoginButton.setEnabled(bIsValid);
        }
      },

      onLoginPress: function () {
        var sUsername = this.getView().byId("usernameInput").getValue();
        var sPassword = this.getView().byId("passwordInput").getValue();

        if (sUsername && sPassword) {
          var oView = this.getView();
          var oContextModel = oView.getModel("context");

          oView.setBusy(true);

          var oPayload = {
            username: sUsername,
            password: sPassword,
            ref_1: "",
            ref_2: "",
          };

          var oConfig =
            this.getOwnerComponent().getManifestEntry("/sap.ui5/config");
          var sApiUrl = oConfig.tokenApiUrl;

          jQuery.ajax({
            url: sApiUrl,
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify(oPayload),
            success: function (oData) {
              oView.setBusy(false);

              if (
                oData &&
                oData.result &&
                oData.result.details &&
                oData.result.details.signer &&
                oData.result.details.signer.length > 0
              ) {
                var oSigner = oData.result.details.signer[0];

                if (oSigner.status === "S" || oSigner.statusCode === "200") {
                  var sToken = oSigner.token;

                  if (oContextModel) {
                    oContextModel.setProperty("/SignatureUsername", sUsername);
                    oContextModel.setProperty("/SignatureToken", sToken);
                    oContextModel.refresh(true);
                  }

                  this._updateInboxActions();
                  MessageToast.show(
                    "เข้าสู่ระบบสำเร็จ! ได้รับ Token เรียบร้อยแล้ว",
                  );
                } else {
                  MessageToast.show(
                    "ไม่สามารถรับ Token ได้: " +
                      (oSigner.message || "ข้อมูลไม่ถูกต้อง"),
                  );
                }
              } else {
                MessageToast.show(
                  "รูปแบบข้อมูลที่ตอบกลับจาก API ไม่ถูกต้องตามที่คาดหวัง",
                );
              }
            }.bind(this),
            error: function (jqXHR, textStatus, errorThrown) {
              oView.setBusy(false);

              var sErrorMsg =
                "เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย หรือ API ขัดข้อง";

              if (jqXHR && jqXHR.responseText) {
                try {
                  var oErrorData = JSON.parse(jqXHR.responseText);
                  if (oErrorData.message && oErrorData.error) {
                    sErrorMsg =
                      oErrorData.message + " (" + oErrorData.error + ")";
                  } else {
                    sErrorMsg =
                      oErrorData.error ||
                      oErrorData.message ||
                      jqXHR.statusText;
                  }
                } catch (e) {
                  sErrorMsg = jqXHR.statusText || sErrorMsg;
                }
              }

              jQuery.sap.log.error("API Token Error:", jqXHR);
              MessageToast.show(
                "Error API แต่ระบบทำการจำลอง (Mock) Token ให้ชั่วคราว",
              );

              if (oContextModel) {
                var sMockToken =
                  "MOCK_TOKEN_" +
                  Math.random().toString(36).substr(2, 9).toUpperCase();

                oContextModel.setProperty("/SignatureUsername", sUsername);
                oContextModel.setProperty("/SignatureToken", sMockToken);
                oContextModel.refresh(true);
              }

              this._updateInboxActions();
            }.bind(this),
          });
        } else {
          MessageToast.show("กรุณากรอก Username และ Password ให้ครบถ้วน");
        }
      },

      _updateInboxActions: function () {
        var oComponentData = this.getOwnerComponent().getComponentData();
        if (
          oComponentData &&
          oComponentData.startupParameters &&
          oComponentData.startupParameters.inboxAPI
        ) {
          var oInboxAPI = oComponentData.startupParameters.inboxAPI;
          var oContextModel =
            this.getView().getModel("context") ||
            this.getOwnerComponent().getModel("context");

          var sToken = oContextModel.getProperty("/SignatureToken") || "";
          var sApproverComment =
            oContextModel.getProperty("/ApproverComment") || "";
          var sStatus = oContextModel.getProperty("/RequestStatus");

          if ((sToken.trim().length > 0 && sApproverComment.trim().length > 0) || sStatus != "PENDING APPROVAL") {
            oInboxAPI.enableAction("approve");
            oInboxAPI.enableAction("reject");
          } else {
            oInboxAPI.disableAction("approve");
            oInboxAPI.disableAction("reject");
          }
        }
      },

      onCommentLiveChange: function () {
        this._updateInboxActions();
      },
    });
  },
);