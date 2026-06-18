sap.ui.define(
  [
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "glmgtnsp/workflowuimodule/model/models",
    "sap/m/MessageBox",
  ],
  function (UIComponent, Device, models, MessageBox) {
    "use strict";

    return UIComponent.extend("glmgtnsp.workflowuimodule.Component", {
      metadata: {
        manifest: "json",
      },

      init: function () {
        // call the base component's init function
        UIComponent.prototype.init.apply(this, arguments);

        // enable routing
        this.getRouter().initialize();

        // set the device model
        this.setModel(models.createDeviceModel(), "device");

        this.setTaskModels();

        // ดึงโมเดล context มาเพื่อใช้เช็คเงื่อนไข
        var oContextModel = this.getModel("context");

        // รอให้โหลดข้อมูลจากหลังบ้านเสร็จก่อนสร้างปุ่ม
        oContextModel.attachRequestCompleted(
          function () {
            var requestStatus = oContextModel.getProperty("/RequestStatus");
            if (requestStatus == "PENDING APPROVAL") {
              const rejectOutcomeId = "reject";
              this.getInboxAPI().addAction(
                {
                  action: rejectOutcomeId,
                  label: "Reject",
                  type: "reject",
                },
                function () {
                  this.completeTask(false, rejectOutcomeId);
                },
                this,
              );

              const approveOutcomeId = "approve";
              this.getInboxAPI().addAction(
                {
                  action: approveOutcomeId,
                  label: "Approve",
                  type: "accept",
                },
                function () {
                  this.completeTask(true, approveOutcomeId);
                },
                this,
              );
            } else {
              const approveOutcomeId = "approve";
              this.getInboxAPI().addAction(
                {
                  action: approveOutcomeId,
                  label: "Close",
                  type: "reject",
                },
                function () {
                  this.completeTask(true, approveOutcomeId);
                },
                this,
              );
            }
          }.bind(this),
        );
      },

      setTaskModels: function () {
        var startupParameters = this.getComponentData().startupParameters;
        this.setModel(startupParameters.taskModel, "task");

        var taskContextModel = new sap.ui.model.json.JSONModel(
          this._getTaskInstancesBaseURL() + "/context",
        );
        this.setModel(taskContextModel, "context");
      },

      _getTaskInstancesBaseURL: function () {
        return (
          this._getWorkflowRuntimeBaseURL() +
          "/task-instances/" +
          this.getTaskInstanceID()
        );
      },

      _getWorkflowRuntimeBaseURL: function () {
        var ui5CloudService = this.getManifestEntry(
          "/sap.cloud/service",
        ).replaceAll(".", "");
        var ui5ApplicationName = this.getManifestEntry(
          "/sap.app/id",
        ).replaceAll(".", "");
        var appPath = `${ui5CloudService}.${ui5ApplicationName}`;
        return `/${appPath}/api/public/workflow/rest/v1`;
      },

      getTaskInstanceID: function () {
        return this.getModel("task").getData().InstanceID;
      },

      getInboxAPI: function () {
        var startupParameters = this.getComponentData().startupParameters;
        return startupParameters.inboxAPI;
      },

      completeTask: function (approvalStatus, outcomeId) {
        this.getModel("context").setProperty("/approved", approvalStatus);
        this._patchTaskInstance(outcomeId);
      },

      _patchTaskInstance: function (outcomeId) {
        const context = this.getModel("context").getData();

        if (context.RequestStatus != "PENDING APPROVAL") {
          context.ApproverComment = context.ApproverComment || "";
          context.SignatureUsername = context.SignatureUsername || "";
          context.SignaturePassword = context.SignaturePassword || "";
          context.SignatureToken = context.SignatureToken || "";
          context.IsClose = true;
        } else {
          context.IsClose = false;
        }

        var data = {
          status: "COMPLETED",
          context: { ...context, comment: context.comment || "" },
          decision: outcomeId,
        };

        jQuery
          .ajax({
            url: `${this._getTaskInstancesBaseURL()}`,
            method: "PATCH",
            contentType: "application/json",
            async: true,
            data: JSON.stringify(data),
            headers: {
              "X-CSRF-Token": this._fetchToken(),
            },
          })
          .done(() => {
            this._refreshTaskList();
          });
      },

      _fetchToken: function () {
        var fetchedToken;

        jQuery.ajax({
          url: this._getWorkflowRuntimeBaseURL() + "/xsrf-token",
          method: "GET",
          async: false,
          headers: {
            "X-CSRF-Token": "Fetch",
          },
          success(result, xhr, data) {
            fetchedToken = data.getResponseHeader("X-CSRF-Token");
          },
        });
        return fetchedToken;
      },

      _refreshTaskList: function () {
        this.getInboxAPI().updateTask("NA", this.getTaskInstanceID());
      },
    });
  },
);