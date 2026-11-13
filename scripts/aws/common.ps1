$ErrorActionPreference = 'Stop'
$env:AWS_PAGER = ''
$Profile = 'campusgo'
$Region = 'ap-southeast-1'
function Aws([string[]]$Arguments) {
    $result = & aws.exe @Arguments --profile $Profile --region $Region --output json --no-cli-pager
    if ($LASTEXITCODE -ne 0) { throw "AWS failed: $($Arguments[0]) $($Arguments[1])" }
    if ($result) { $result -join "`n" | ConvertFrom-Json }
}
function AwsRequest([string[]]$Arguments, $Request) {
    $file = Join-Path $env:TEMP ('campusgo-' + [guid]::NewGuid() + '.json')
    try {
        [IO.File]::WriteAllText($file, ($Request | ConvertTo-Json -Depth 60), [Text.UTF8Encoding]::new($false))
        Aws ($Arguments + @('--cli-input-json', "file://$file"))
    } finally { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file } }
}
if ((Aws @('sts','get-caller-identity')).Account -ne '807733922601') { throw 'Unexpected AWS account' }
