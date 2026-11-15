$ErrorActionPreference = 'Stop'

$assets = @(
  @{
    Url = 'https://www.footballgames.org/wp-content/games/baggio-magical-kicks.swf'
    Path = Join-Path $PSScriptRoot 'games/baggio-magical-kicks.swf'
    Sha256 = '77B70319804B05FF9B59AD8724D675F6A384F0295684C74FE50F06CFD3D72F4E'
  },
  @{
    Url = 'https://footballgames.b-cdn.net/wp-content/thumbs/baggio-magical-kicks.jpg'
    Path = Join-Path $PSScriptRoot 'hub/banner-source.jpg'
    Sha256 = '0AAC7E54A81AB6EB1B74FA66DA133E24B17237924F21FB4E1C5B7652B7B5D6C3'
  }
)

foreach ($asset in $assets) {
  $directory = Split-Path -Parent $asset.Path
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $temporaryPath = "$($asset.Path).download"
  try {
    Invoke-WebRequest -Uri $asset.Url -OutFile $temporaryPath
    $actualHash = (Get-FileHash -Path $temporaryPath -Algorithm SHA256).Hash
    if ($actualHash -ne $asset.Sha256) {
      throw "Checksum mismatch for $($asset.Url): expected $($asset.Sha256), got $actualHash"
    }
    Move-Item -Path $temporaryPath -Destination $asset.Path -Force
    Write-Output "Verified $($asset.Path) ($actualHash)"
  } finally {
    Remove-Item -Path $temporaryPath -Force -ErrorAction SilentlyContinue
  }
}