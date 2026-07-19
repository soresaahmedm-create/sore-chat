function Install-If-Needed($path, $label) {
    if (Test-Path "$path\node_modules") {
        Write-Host "[$label] already installed, skipping" -ForegroundColor Yellow
    } else {
        Write-Host "[$label] installing..." -ForegroundColor Cyan
        cd $path
        npm install
    }
}

Install-If-Needed "$PSScriptRoot\desktop" "desktop"
Install-If-Needed "$PSScriptRoot\mobile" "mobile"
Install-If-Needed "$PSScriptRoot\backend\functions" "backend functions"

cd $PSScriptRoot
Write-Host "All set up." -ForegroundColor Green
