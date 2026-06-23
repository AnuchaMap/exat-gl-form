sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/ui/model/json/JSONModel",
  ],
  function (Controller, MessageToast, JSONModel) {
    "use strict";

    return Controller.extend("glmgtnsp.workflowuimodule.controller.App", {

      // ─── Init ────────────────────────────────────────────────────────────
      onInit: function () {
        var oComponent = this.getOwnerComponent();
        if (oComponent) {
          oComponent.attachEvent(
            "modelContextChange",
            this._onContextModelChange,
            this,
          );
        }

        var oViewModel = new JSONModel({
          Attachments: [],
          iframeContent: "<div>กำลังโหลดเอกสาร...</div>",
        });
        this.getView().setModel(oViewModel, "view");

        this.onLoginChange();
        
        // กำหนดจำนวนรอบเริ่มต้นในการลองโหลดใหม่ (สูงสุด 5 รอบ)
        this._iPdfRetryCount = 0;
        this._iDmsRetryCount = 0;

        // เรียกใช้งานครั้งแรกตอน Init
        this.onPreviewPdf();
      },

      // ─── Status Style ─────────────────────────────────────────────────────
      _applyStatusStyle: function () {
        var oContextModel =
          this.getView().getModel("context") ||
          this.getOwnerComponent().getModel("context");

        if (!oContextModel) return;

        var wfType = oContextModel.getProperty("/WorkflowType");
        var bIsAllApproved = oContextModel.getProperty("/IsAllApproved");
        var bIsReject = oContextModel.getProperty("/IsReject");

        var oNestedView = this.byId("nested" + wfType);
        if (!oNestedView) return;

        var oText = oNestedView.byId("txtStatus");
        if (!oText) return;

        oText.removeStyleClass("pending");
        oText.removeStyleClass("approved");
        oText.removeStyleClass("rejected");

        if (bIsReject) {
          oText.addStyleClass("requestStatus");
          oText.addStyleClass("rejected");
        } else if (bIsAllApproved) {
          oText.addStyleClass("requestStatus");
          oText.addStyleClass("approved");
        } else {
          oText.addStyleClass("requestStatus");
          oText.addStyleClass("pending");
        }
      },

      // ─── Context Model Change ─────────────────────────────────────────────
      _onContextModelChange: function () {
        var oContextModel =
          this.getView().getModel("context") ||
          this.getOwnerComponent().getModel("context");

        if (oContextModel) {
          setTimeout(
            function () {
              // ทุกครั้งที่ Context เปลี่ยน ให้รีเซ็ตจำนวนรอบกลับไปเริ่มนับ 1 ใหม่เพื่อลองโหลดข้อมูลของ context นั้น
              this._iPdfRetryCount = 0;
              this._iDmsRetryCount = 0;

              this._loadDmsAttachmentsOnly();
              this.onPreviewPdf(); // เปิดให้ทำงานที่นี่ด้วยเมื่อ context มั่นใจว่าเปลี่ยนจริง
              this._updateInboxActions();
              this._applyStatusStyle();
            }.bind(this),
            1000,
          );
        }
      },

      // ─── DMS Attachments (เพิ่มระบบ Retry 5 รอบ) ──────────────────────────
      _loadDmsAttachmentsOnly: function () {
        var oView = this.getView();
        var oViewModel = oView.getModel("view");
        var oContextModel =
          oView.getModel("context") ||
          this.getOwnerComponent().getModel("context");

        // ถ้าระบบยังโหลดโมเดลไม่เสร็จ ให้เข้าสู่กลไกสู้ชีวิต (Retry)
        if (!oViewModel || !oContextModel) {
          this._retryDmsLoad("โมเดลระบบยังไม่พร้อม");
          return;
        }

        var sFolderId = oContextModel.getProperty("/FolderID");
        if (!sFolderId || sFolderId === "undefined") {
          this._retryDmsLoad("ยังไม่พบข้อมูล FolderID");
          return;
        }

        oView.setBusy(true);
        var oConfig = this.getOwnerComponent().getManifestEntry("/sap.ui5/config");
        var sApiUrl = oConfig.dmsApiUrl.replace("{FOLDER_ID}", sFolderId);

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
              oViewModel.setProperty("/Attachments", aApiAttachments);
            } else {
              // ถ้า API ตอบกลับสำเร็จแต่ไม่มี items ให้ลองโหลดใหม่เผื่อข้อมูลฝั่ง server ยัง sync ไม่ทัน
              this._retryDmsLoad("โครงสร้าง API ไม่พบรายการไฟล์");
            }
          }.bind(this),
          error: function (oError) {
            oView.setBusy(false);
            jQuery.sap.log.error(oError);
            this._retryDmsLoad("เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย API");
          }.bind(this),
        });
      },

      // ฟังก์ชันช่วยในการโหลด DMS ซ้ำ
      _retryDmsLoad: function (sReason) {
        var oViewModel = this.getView().getModel("view");
        if (this._iDmsRetryCount < 5) {
          this._iDmsRetryCount++;
          console.log("DMS Retry ครั้งที่ " + this._iDmsRetryCount + " เนื่องจาก: " + sReason);
          setTimeout(this._loadDmsAttachmentsOnly.bind(this), 1500); // รอ 1.5 วินาทีแล้วลองใหม่
        } else {
          this.getView().setBusy(false);
          if (oViewModel) oViewModel.setProperty("/Attachments", []);
          //MessageToast.show("โหลดรายการเอกสารแนบไม่สำเร็จหลังจากพยายาม 5 ครั้ง");
        }
      },


      // ─── PDF Preview (เพิ่มระบบ Retry 5 รอบ) ──────────────────────────────
      onPreviewPdf: function () {
        var oView = this.getView();
        var oContextModel =
          oView.getModel("context") ||
          this.getOwnerComponent().getModel("context");

        // ถ้ารอบแรกโมเดลยังไม่มา ให้วิ่งเข้าฟังก์ชันลองใหม่ (Retry)
        if (!oContextModel) {
          this._retryPdfPreview("Context Model ยังไม่พร้อม");
          return;
        }

        var sPreviewFolderId = oContextModel.getProperty("/PreviewFolderID");
        
        if (!sPreviewFolderId || sPreviewFolderId === "undefined") {
          this._retryPdfPreview("ยังไม่พบข้อมูล PreviewFolderID");
          return;
        }

        var oConfig = this.getOwnerComponent().getManifestEntry("/sap.ui5/config");
        var sApiUrl = oConfig.dmsApiUrl.replace("{FOLDER_ID}", sPreviewFolderId);

        oView.setBusy(true);

        jQuery.ajax({
          url: sApiUrl,
          method: "GET",
          dataType: "json",
          success: function (oData) {
            if (oData && oData.success && oData.items && oData.items.length > 0) {
              var sFileId = oData.items[0].id;
              var sBase64Url = "https://sbpa_helper.cfapps.ap10.hana.ondemand.com/api/dms/file/" + sFileId + "/base64";

              fetch(sBase64Url)
                .then(function (res) { return res.json(); })
                .then(function (oFileData) {
                  oView.setBusy(false);
                  if (oFileData.success && oFileData.base64Data) {
                    this.loadPdf(oFileData.base64Data);
                  } else {
                    this._retryPdfPreview("ดึงข้อมูล Base64 ของไฟล์ไม่สำเร็จ");
                  }
                }.bind(this))
                .catch(function (err) {
                  oView.setBusy(false);
                  jQuery.sap.log.error("Error fetching preview base64:", err);
                  this._retryPdfPreview("เกิดข้อผิดพลาดในการดึง Base64");
                }.bind(this));
            } else {
              // ถ้าเรียกโฟลเดอร์สำเร็จแต่ของข้างในยังไม่มา ให้ลองใหม่
              this._retryPdfPreview("ไม่พบไฟล์เอกสารด้านในโฟลเดอร์ Preview");
            }
          }.bind(this),
          error: function (oError) {
            oView.setBusy(false);
            jQuery.sap.log.error(oError);
            this._retryPdfPreview("เกิดข้อผิดพลาดของระบบเครือข่าย API");
          }.bind(this),
        });
      },

      // ฟังก์ชันช่วยในการโหลด PDF Preview ซ้ำ
      _retryPdfPreview: function (sReason) {
        var oViewModel = this.getView().getModel("view");
        if (this._iPdfRetryCount < 5) {
          this._iPdfRetryCount++;
          console.log("PDF Preview Retry ครั้งที่ " + this._iPdfRetryCount + " เนื่องจาก: " + sReason);
          
          if (oViewModel) {
            oViewModel.setProperty("/iframeContent", "<div>กำลังพยายามโหลดเอกสารใหม่... (ครั้งที่ " + this._iPdfRetryCount + "/5)</div>");
          }
          
          // หน่วงเวลา 2 วินาทีเพื่อให้โอกาสระบบหลังบ้านส่งข้อมูลมาครบ แล้วค่อยสั่งรันฟังก์ชันเดิมซ้ำ
          setTimeout(this.onPreviewPdf.bind(this), 2000); 
        } else {
          this.getView().setBusy(false);
          if (oViewModel) {
            oViewModel.setProperty("/iframeContent", "<div>ไม่พบเอกสาร Preview หรือโหลดเอกสารไม่สำเร็จเกิน 5 ครั้ง</div>");
          }
          //MessageToast.show("โหลดเอกสาร Preview ไม่สำเร็จหลังจากพยายาม 5 ครั้ง");
        }
      },

      loadPdf: function (sBase64) {
        var byteCharacters = window.atob(sBase64);
        var byteArrays = [];
        for (var offset = 0; offset < byteCharacters.length; offset += 512) {
          var slice = byteCharacters.slice(offset, offset + 512);
          var byteNumbers = new Array(slice.length);
          for (var i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
          }
          byteArrays.push(new Uint8Array(byteNumbers));
        }

        var blob = new Blob(byteArrays, { type: "application/pdf" });
        var blobUrl = URL.createObjectURL(blob);
        var sIframeHtml =
          '<iframe src="' + blobUrl +
          '" width="100%" height="595px" style="border: none; border-radius: 4px; display: block; max-width: 100%;"></iframe>';

        this.getView().getModel("view").setProperty("/iframeContent", sIframeHtml);
      },

      // ─── Login ────────────────────────────────────────────────────────────
      onLoginChange: function () {
        var oView = this.getView();
        var sUsername = oView.byId("usernameInput")
          ? oView.byId("usernameInput").getValue() : "";
        var sPassword = oView.byId("passwordInput")
          ? oView.byId("passwordInput").getValue() : "";

        var oLoginButton = oView.byId("loginButton");
        if (oLoginButton) {
          oLoginButton.setEnabled(
            sUsername.trim().length > 0 && sPassword.trim().length > 0,
          );
        }
      },

      onLoginPress: function () {
        var oView = this.getView();
        var sUsername = oView.byId("usernameInput").getValue();
        var sPassword = oView.byId("passwordInput").getValue();

        if (!sUsername || !sPassword) {
          MessageToast.show("กรุณากรอก Username และ Password ให้ครบถ้วน");
          return;
        }

        var oContextModel = oView.getModel("context");
        oView.setBusy(true);

        var oConfig = this.getOwnerComponent().getManifestEntry("/sap.ui5/config");

        jQuery.ajax({
          url: oConfig.tokenApiUrl,
          method: "POST",
          contentType: "application/json",
          data: JSON.stringify({ username: sUsername, password: sPassword, ref_1: "", ref_2: "" }),
          success: function (oData) {
            oView.setBusy(false);
            var oSigner =
              oData &&
              oData.result &&
              oData.result.details &&
              oData.result.details.signer &&
              oData.result.details.signer[0];

            if (oSigner && (oSigner.status === "S" || oSigner.statusCode === "200")) {
              if (oContextModel) {
                oContextModel.setProperty("/SignatureUsername", sUsername);
                oContextModel.setProperty("/SignatureToken", oSigner.token);
                oContextModel.refresh(true);
              }
              this._updateInboxActions();
              MessageToast.show("เข้าสู่ระบบสำเร็จ! ได้รับ Token เรียบร้อยแล้ว");
            } else {
              MessageToast.show(
                "ไม่สามารถรับ Token ได้: " +
                ((oSigner && oSigner.message) || "ข้อมูลไม่ถูกต้อง"),
              );
            }
          }.bind(this),
          error: function (jqXHR) {
            oView.setBusy(false);
            jQuery.sap.log.error("API Token Error:", jqXHR);
            MessageToast.show("Error API แต่ระบบทำการจำลอง (Mock) Token ให้ชั่วคราว");

            if (oContextModel) {
              oContextModel.setProperty("/SignatureUsername", sUsername);
              oContextModel.setProperty(
                "/SignatureToken",
                "MOCK_TOKEN_" + Math.random().toString(36).substr(2, 9).toUpperCase(),
              );
              oContextModel.refresh(true);
            }
            this._updateInboxActions();
          }.bind(this),
        });
      },

      // ─── Inbox Actions ────────────────────────────────────────────────────
      _updateInboxActions: function () {
        var oComponentData = this.getOwnerComponent().getComponentData();
        if (
          !oComponentData ||
          !oComponentData.startupParameters ||
          !oComponentData.startupParameters.inboxAPI
        ) return;

        var oInboxAPI = oComponentData.startupParameters.inboxAPI;
        var oContextModel =
          this.getView().getModel("context") ||
          this.getOwnerComponent().getModel("context");

        var sToken = oContextModel.getProperty("/SignatureToken") || "";
        var bIsAllApproved = oContextModel.getProperty("/IsAllApproved");
        var bIsReject = oContextModel.getProperty("/IsReject");
        var bIsClose = oContextModel.getProperty("/IsClose");

        if ((sToken.trim().length > 0  && !bIsAllApproved && !bIsReject) || bIsClose) {
          oInboxAPI.enableAction("approve");
          oInboxAPI.enableAction("reject");
        } else {
          oInboxAPI.disableAction("approve");
          oInboxAPI.disableAction("reject");
        }

        oContextModel.refresh(true);
      },

      onCommentLiveChange: function () {
        this._updateInboxActions();
      },

      // ─── Path Buttons ────────────────────────────────────────────────────
      onCorrectPathClick: function () {
        MessageToast.show("Correct Path Clicked");
      },

      onIncorrectPathClick: function () {
        MessageToast.show("Incorrect Path Clicked");
      },
    });
  },
);