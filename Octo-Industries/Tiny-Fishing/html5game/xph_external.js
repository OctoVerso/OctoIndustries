
function js_GetExternalGameData(projectName, keyname, extraInfo, defaultValue)
{
	if (window.ZenExternal)
	{
		return ZenExternal.getProjectData(projectName, keyname, extraInfo);
	} else
	{
		return defaultValue;
	}
}

function js_GetExternalData(keyname, extraInfo, defaultValue)
{
	if (window.ZenExternal)
	{
		return ZenExternal.getData(keyname, extraInfo);
	} else
	{
		return defaultValue;
	}
}


function js_LoadExternalFile(filepath)
{
	var url = new URL(filepath, window.location.href);
	if (url.origin !== window.location.origin) {
		console.warn("Blocked external runtime script:", url.href);
		return 0;
	}

	var x = document.createElement('script');
	x.src = url.href;
	document.getElementsByTagName("head")[0].appendChild(x);
	return 1;
}