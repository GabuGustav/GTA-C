mexui.util.createControlConstructor('Image', false, function(window, x, y, w, h, filePath, styles, callback)
{
	mexui.Component.Control.call(this, window, x, y, w, h, this.linkControlStyles('Image', styles), callback);
	
	this.image				= mexui.native.loadImage(filePath);
});

// default styles
mexui.util.linkBaseControlStyles('Image', {});

// input
mexui.Control.Image.prototype.onMouseDown = function(e)
{
	if(e.button == 0 && this.isCursorOverControl())
	{
		e.used = true;
		this.checkToCallCallback();
	}
};

mexui.Control.Image.prototype.onKeyDown = function(e, key, mods)
{
	if(this.isFocused() && (key == SDLK_RETURN || key == SDLK_RETURN2 || key == SDLK_KP_ENTER || key == SDLK_SPACE))
	{
		e.used = true;
		this.checkToCallCallback();
	}
};

// render
mexui.Control.Image.prototype.render = function()
{
	var pos = this.getScreenPosition();
	
	mexui.native.drawImage(pos, this.size, this.image, this.getStyles('main'));
	
	if(this.isFocused())
		mexui.native.drawRectangleBorder(mexui.util.subtractVec2(pos,new Vec2(2,2)), mexui.util.addVec2(this.size,new Vec2(3,3)), this.getStyles('focused'));
};