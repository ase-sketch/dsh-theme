
$ErrorActionPreference='Stop'
$script='E:\dsh-theme\scripts\build-icons.mjs'
$out='E:\dsh-theme\plugins\dsh-theme\assets\icons\lucide.json'
$a='E:\dsh-theme\.agents\tmp\m7-icons\r1.json'
$b='E:\dsh-theme\.agents\tmp\m7-icons\r2.json'

# 固定时间戳 -> 完全确定性构建，两次独立运行
node $script --out $a --generated-at 2026-01-01T00:00:00.000Z | Out-Host
node $script --out $b --generated-at 2026-01-01T00:00:00.000Z | Out-Host
$ha=(Get-FileHash $a -Algorithm SHA256).Hash
$hb=(Get-FileHash $b -Algorithm SHA256).Hash
"固定时间戳 两次独立运行 sha256:"
"  run1 = $ha"
"  run2 = $hb"
"  逐字节一致 = $($ha -eq $hb)"
$fa=[IO.File]::ReadAllBytes($a); $fb=[IO.File]::ReadAllBytes($b)
"  字节数 run1=$($fa.Length) run2=$($fb.Length)  内容相等=$([Linq.Enumerable]::SequenceEqual([byte[]]$fa,[byte[]]$fb))"

# 不固定时间戳 -> 只有 generatedAt 字段不同
$c='E:\dsh-theme\.agents\tmp\m7-icons\r3.json'
$d='E:\dsh-theme\.agents\tmp\m7-icons\r4.json'
node $script --out $c | Out-Null
node $script --out $d | Out-Null
$ja=[IO.File]::ReadAllText($c); $jb=[IO.File]::ReadAllText($d)
"不固定时间戳: 原文逐字节一致 = $($ja -eq $jb)"
$ja2=$ja -replace '"generatedAt":"[^"]*"','"generatedAt":"X"'
$jb2=$jb -replace '"generatedAt":"[^"]*"','"generatedAt":"X"'
"  剔除 generatedAt 后一致 = $($ja2 -eq $jb2)"
# 定位差异字符数
$diff=0; for($i=0;$i -lt [Math]::Min($ja.Length,$jb.Length);$i++){ if($ja[$i] -ne $jb[$i]){$diff++} }
"  实际差异字符数 = $diff (len1=$($ja.Length) len2=$($jb.Length))"

# 落到最终交付路径
node $script | Out-Host
"交付文件 sha256 = $((Get-FileHash $out -Algorithm SHA256).Hash)"
"交付文件 字节数 = $((Get-Item $out).Length)"
