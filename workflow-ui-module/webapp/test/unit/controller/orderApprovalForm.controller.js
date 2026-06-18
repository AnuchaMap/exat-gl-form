/*global QUnit*/

sap.ui.define([
	"glmgtnsp/workflow-ui-module/controller/glApprovalForm.controller"
], function (Controller) {
	"use strict";

	QUnit.module("glApprovalForm Controller");

	QUnit.test("I should test the glApprovalForm controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
